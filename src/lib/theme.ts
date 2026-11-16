import { useColorMode } from '@vueuse/core';

/** 'auto' follows the system setting; the choice is remembered in localStorage. */
export const colorMode = useColorMode({ storageKey: 'theme', initialValue: 'auto', emitAuto: true });
