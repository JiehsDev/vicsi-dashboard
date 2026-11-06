import 'server-only';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
function key(){
 const secret=process.env.DASHBOARD_SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret)throw new Error('Account setup encryption is not configured.');
 return createHash('sha256').update('vicsi/account-setup/v1\0'+secret).digest();
}
export function hashSetupToken(token:string){return createHash('sha256').update(token).digest('hex');}
export function validSetupToken(token:unknown):token is string{return typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);}
export function newSetupToken(){
 const token=randomBytes(32).toString('base64url'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return {hash:hashSetupToken(token),ciphertext:Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url')};
}
export function decryptSetupToken(value:string){
 const bytes=Buffer.from(value,'base64url');const cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));
 cipher.setAuthTag(bytes.subarray(12,28));const token=Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');
 if(!validSetupToken(token))throw new Error('Invalid account setup token.');return token;
}
