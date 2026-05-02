import { atom } from 'jotai';
import { apiGet } from '../api/base';
import type { EndpointItem } from '../pages/config/LLM/types';

/**
 * LLM 端点全局状态。
 *
 * 数据源：`/api/config/endpoints`、`/api/config/compiler-endpoint`、`/api/config/stt-endpoints`。
 * 各页面（Chat / Scheduler / Topbar / ConfigLLM）订阅同一 atom，避免各自缓存导致的不同步。
 * 在 ConfigLLM 增删改后调用 `refreshEndpointsAtom` 重新拉取，订阅方自动获得最新值。
 */
export const endpointsAtom = atom<EndpointItem[]>([]);

export const sttEndpointsAtom = atom<EndpointItem[]>([]);

export const compilerEndpointIdAtom = atom<string | null>(null);

/** 端点列表是否已经至少成功加载过一次，用于区分"加载中空数组"与"真的没有"。 */
export const endpointsLoadedAtom = atom<boolean>(false);

type EndpointsResponse = { endpoints?: EndpointItem[] };
type SttEndpointsResponse = { endpoints?: EndpointItem[] };
type CompilerEndpointResponse = { endpoint_id?: string | null };

/**
 * Write-only atom：拉齐三个端点接口并写入对应 atom。
 * 调用方 `useSetAtom(refreshEndpointsAtom)`，错误向上抛出由调用方处理。
 */
export const refreshEndpointsAtom = atom(null, async (_get, set) => {
  const [endpointData, compilerData, sttData] = await Promise.all([
    apiGet<EndpointsResponse>('/api/config/endpoints'),
    apiGet<CompilerEndpointResponse>('/api/config/compiler-endpoint'),
    apiGet<SttEndpointsResponse>('/api/config/stt-endpoints'),
  ]);
  set(endpointsAtom, endpointData.endpoints ?? []);
  set(compilerEndpointIdAtom, compilerData.endpoint_id ?? null);
  set(sttEndpointsAtom, sttData.endpoints ?? []);
  set(endpointsLoadedAtom, true);
});
