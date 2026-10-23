import {handleSite} from '../../server-auth.mjs';
import {assets} from '../../server-assets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function handle(request){return handleSite(request,process.env,assets);}
export {handle as GET,handle as POST,handle as HEAD,handle as OPTIONS};
