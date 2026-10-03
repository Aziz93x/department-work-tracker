import {scryptSync,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return 'scrypt$16384$8$5$'+salt+'$'+scryptSync(password,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('hex')}
export function verifyPassword(password:string,encoded:string){const [scheme,n,r,p,salt,hash]=encoded.split('$');if(scheme!=='scrypt')return false;const actual=scryptSync(password,salt,32,{N:+n,r:+r,p:+p,maxmem:32*1024*1024});const expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)}
export function token(){return randomBytes(32).toString('hex')}
export function digest(value:string){return createHash('sha256').update(value).digest('hex')}

