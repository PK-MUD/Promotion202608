import {getStore} from '@netlify/blobs';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../../server/auth.mjs';
import {bootstrapHash} from '../../server/setup-config.mjs';
export default createHandler({
  getStore:()=>getStore({name:'gd-promotion-access-v1',consistency:'strong'}),
  bootstrapHash,
  readDashboard:()=>readFile('private/dashboard.html.gz'),
});
export const config={path:['/api/status','/api/session','/api/login','/api/logout','/api/password','/dashboard']};
