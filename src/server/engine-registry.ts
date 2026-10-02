// Only fingerprints reproduced from exact published source may be registered.
export const retainedEngines = {
  'b72423936fb4e2138ccd35578ea2666b6226b5651f80f60f729c00bb362fda2f': () => import('./retained/b72423936fb4e2138ccd35578ea2666b6226b5651f80f60f729c00bb362fda2f'),
  'd1c19bfa17149028ebf4ad10664f9b11408d705f703b1c0962cc2bdee535193c': () => import('./retained/d1c19bfa17149028ebf4ad10664f9b11408d705f703b1c0962cc2bdee535193c'),
  'ee5ec959c1be45675e159dd692f908d5cba2057c7789e5b85c8fe6e345aeb889': () => import('./retained/ee5ec959c1be45675e159dd692f908d5cba2057c7789e5b85c8fe6e345aeb889'),
  'ccf7eee8ff74a40d37e0a92ad6d61fc9034753d0e425924544bba9046bab0efa': () => import('./retained/ccf7eee8ff74a40d37e0a92ad6d61fc9034753d0e425924544bba9046bab0efa'),
  'fd779772563d70c9d0a89198165ee82c2741f04d543a32c8b9cb904b5fef71af': () => import('./retained/fd779772563d70c9d0a89198165ee82c2741f04d543a32c8b9cb904b5fef71af'),
  '1f715cc52538fb42ba73c3bbbef07b1a948c1f7f1cdcd6f55a986960bfdd8ac4': () => import('./retained/1f715cc52538fb42ba73c3bbbef07b1a948c1f7f1cdcd6f55a986960bfdd8ac4'),
  '5809ccf28f7e3e9d2f897f7a23c03ecfe41c0de21b98432a7776949f4ac4d2f2': () => import('./legacy-v021'),
  '94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b': () => import('./retained/94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b'),
};
export function retainedEngine(build: string) { return retainedEngines[build as keyof typeof retainedEngines]; }
