import { atom } from 'jotai';

/** 当前正在生成的会话 ID 集合，每个会话状态独立 */
export const chatGeneratingAtom = atom<Set<string>>(new Set<string>());
