// Only fingerprints reproduced from exact published source may be registered.
export const retainedEngines = {
  '1f715cc52538fb42ba73c3bbbef07b1a948c1f7f1cdcd6f55a986960bfdd8ac4': () => import('./retained/1f715cc52538fb42ba73c3bbbef07b1a948c1f7f1cdcd6f55a986960bfdd8ac4'),
  '5809ccf28f7e3e9d2f897f7a23c03ecfe41c0de21b98432a7776949f4ac4d2f2': () => import('./legacy-v021'),
  '94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b': () => import('./retained/94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b'),
};
export function retainedEngine(build: string) { return retainedEngines[build as keyof typeof retainedEngines]; }
