'use client';
import type {User} from '@/lib/contracts';
export default function AccountAvatar({user,className=''}:{user:User;className?:string}){
 return <span className={'account-avatar '+className} aria-label={'الصورة الشخصية: '+user.display_name}>{user.avatar_updated_at?<img src={'/api/users/'+user.id+'/avatar?v='+user.avatar_updated_at} alt=""/>:<span aria-hidden="true">{user.display_name.charAt(0)}</span>}</span>
}
