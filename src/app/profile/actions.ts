'use server';
import {revalidatePath} from 'next/cache';
import {createProfileBackend} from '@/lib/profileServer';
import {performProfileAction,type ProfileResult} from '@/lib/profileManagement';

export async function manageProfile(_previous:ProfileResult,form:FormData):Promise<ProfileResult>{
  let result:ProfileResult;
  try{result=await performProfileAction(form,await createProfileBackend());}
  catch{return {ok:false,message:'Account security is temporarily unavailable. Refresh before trying again.'};}
  if(result.ok && !result.signedOut)revalidatePath('/','layout');
  return result;
}
