// Runtime Mixamo-style bone map generation for dropped .glb characters.
// Looks for Mixamo / Mixamo-like names (with or without the mixamorig: prefix)
// and builds a characters.js-compatible config. Returns null + missing list
// when the rig doesn't match.

import * as THREE from 'three';

const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);

/** Strip Mixamo prefix / punctuation for fuzzy matching. */
function normalize(name) {
  return sanitize(name)
    .replace(/^mixamorig/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

/**
 * Logical Mixamo roles → accepted name variants (normalized).
 * Order of candidates is preference order.
 */
const ROLES = {
  hips: ['hips'],
  spine: ['spine'],
  spine1: ['spine1'],
  spine2: ['spine2', 'chest', 'spine02'],
  neck: ['neck'],
  head: ['head'],
  headTop: ['headtopend', 'headtop', 'head_end', 'headend'],
  leftArm: ['leftarm', 'leftupperarm'],
  leftForeArm: ['leftforearm', 'leftlowerarm'],
  leftHand: ['lefthand'],
  rightArm: ['rightarm', 'rightupperarm'],
  rightForeArm: ['rightforearm', 'rightlowerarm'],
  rightHand: ['righthand'],
  leftUpLeg: ['leftupleg', 'leftthigh', 'leftupperleg'],
  leftLeg: ['leftleg', 'leftcalf', 'leftlowerleg'],
  leftFoot: ['leftfoot'],
  leftToe: ['lefttoebase', 'lefttoe'],
  rightUpLeg: ['rightupleg', 'rightthigh', 'rightupperleg'],
  rightLeg: ['rightleg', 'rightcalf', 'rightlowerleg'],
  rightFoot: ['rightfoot'],
  rightToe: ['righttoebase', 'righttoe'],
};

const REQUIRED = [
  'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'leftArm', 'leftForeArm', 'leftHand',
  'rightArm', 'rightForeArm', 'rightHand',
  'leftUpLeg', 'leftLeg', 'leftFoot',
  'rightUpLeg', 'rightLeg', 'rightFoot',
];

/**
 * Collect bone node names from a loaded glTF scene root.
 * @param {THREE.Object3D} root
 * @returns {string[]}
 */
export function collectBoneNames(root) {
  const names = [];
  root.traverse((n) => {
    if (n.isBone) names.push(n.name);
  });
  return names;
}

/**
 * Resolve each logical role to an actual bone name present in the file.
 * @param {string[]} boneNames
 * @returns {{ map: Record<string, string>, missing: string[] }}
 */
export function resolveMixamoBones(boneNames) {
  const byNorm = new Map();
  for (const name of boneNames) {
    const key = normalize(name);
    if (!byNorm.has(key)) byNorm.set(key, name);
  }

  const map = {};
  const missing = [];
  for (const [role, variants] of Object.entries(ROLES)) {
    let found = null;
    for (const v of variants) {
      if (byNorm.has(v)) {
        found = byNorm.get(v);
        break;
      }
    }
    if (found) map[role] = found;
    else if (REQUIRED.includes(role)) missing.push(role);
  }
  return { map, missing };
}

/**
 * Build a CHARACTERS-style config from a Mixamo-like bone map.
 * @param {Record<string, string>} map role → actual bone name
 * @param {{ label: string, url: string, targetHeight?: number }} meta
 */
export function configFromMixamoMap(map, meta) {
  const b = (role) => map[role];
  const segments = [
    { bone: b('spine'), child: b('spine1'), from: 'HIP_CENTER', to: 'NECK' },
    { bone: b('spine1'), child: b('spine2'), from: 'HIP_CENTER', to: 'NECK' },
    { bone: b('neck'), child: b('head'), from: 'NECK', to: 'HEAD_CENTER' },
  ];
  segments.push(
    { bone: b('leftArm'), child: b('leftForeArm'), from: 'LEFT_SHOULDER', to: 'LEFT_ELBOW' },
    { bone: b('leftForeArm'), child: b('leftHand'), from: 'LEFT_ELBOW', to: 'LEFT_WRIST' },
    { bone: b('rightArm'), child: b('rightForeArm'), from: 'RIGHT_SHOULDER', to: 'RIGHT_ELBOW' },
    { bone: b('rightForeArm'), child: b('rightHand'), from: 'RIGHT_ELBOW', to: 'RIGHT_WRIST' },
    { bone: b('leftUpLeg'), child: b('leftLeg'), from: 'LEFT_HIP', to: 'LEFT_KNEE' },
    { bone: b('leftLeg'), child: b('leftFoot'), from: 'LEFT_KNEE', to: 'LEFT_ANKLE' },
    { bone: b('rightUpLeg'), child: b('rightLeg'), from: 'RIGHT_HIP', to: 'RIGHT_KNEE' },
    { bone: b('rightLeg'), child: b('rightFoot'), from: 'RIGHT_KNEE', to: 'RIGHT_ANKLE' },
  );
  if (b('leftToe')) {
    segments.push({ bone: b('leftFoot'), child: b('leftToe'), from: 'LEFT_HEEL', to: 'LEFT_FOOT_INDEX' });
  }
  if (b('rightToe')) {
    segments.push({ bone: b('rightFoot'), child: b('rightToe'), from: 'RIGHT_HEEL', to: 'RIGHT_FOOT_INDEX' });
  }

  return {
    label: meta.label,
    url: meta.url,
    targetHeight: meta.targetHeight ?? 1.7,
    custom: true,
    pelvis: { bone: b('hips') },
    chest: { bone: b('spine2') },
    head: { bone: b('head') },
    segments,
    positionBones: [],
  };
}

/**
 * Inspect a loaded root and return a config, or { ok:false, missing }.
 * @param {THREE.Object3D} root
 * @param {{ label: string, url: string }} meta
 */
export function tryBuildMixamoConfig(root, meta) {
  const boneNames = collectBoneNames(root);
  if (!boneNames.length) {
    return { ok: false, missing: ['(no bones found in file)'], boneNames };
  }
  const { map, missing } = resolveMixamoBones(boneNames);
  if (missing.length) {
    return { ok: false, missing, boneNames };
  }
  return { ok: true, config: configFromMixamoMap(map, meta), boneNames };
}
