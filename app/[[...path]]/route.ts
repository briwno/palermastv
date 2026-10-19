import {env} from 'cloudflare:workers';
import {handleSite} from '../../server-auth.mjs';
import {assets} from '../../server-assets';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleSite(request,env,assets);}
export async function POST(request:Request){return handleSite(request,env,assets);}
export async function HEAD(request:Request){return handleSite(request,env,assets);}
