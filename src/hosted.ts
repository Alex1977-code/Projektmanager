/** true in der veröffentlichten Version (Artifact auf claude.ai), false beim eigenen Server. */
export const IS_HOSTED = import.meta.env.VITE_TARGET === 'artifact';

/** Kennung dieses Browserfensters – damit eigene Änderungen nicht als „fremd“ nachgeladen werden. */
export const CLIENT_ID = Math.random().toString(36).slice(2, 10);
