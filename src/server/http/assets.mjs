import { privateHeaders } from './responses.mjs';

/** Serve generated browser resources through the same session boundary as pages. */
export function assetResponse(request, asset, extraHeaders = {}) {
  return new Response(request.method === 'HEAD' ? null : asset.body, {
    headers: { ...privateHeaders, 'Content-Type': asset.type, ...extraHeaders },
  });
}
