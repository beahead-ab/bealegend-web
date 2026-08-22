declare const __APP_VERSION__: string;

/**
 * What this build calls itself, injected from the repo's VERSION file at build
 * time. Never written here: a literal in this file would be the second source
 * the whole arrangement exists to avoid.
 */
export const APP_VERSION: string = __APP_VERSION__;
