// Browser fixture only. No production imports or credentials.
export async function manageProfile(_previous:unknown,form:FormData){
  const operation=String(form.get('operation'));
  await new Promise(resolve=>setTimeout(resolve,120));
  if(form.get('currentPassword')==='wrong')return {ok:false,message:'Your current password could not be verified. Check it and try again.'};
  document.documentElement.dataset.profileSaved=operation;
  return {ok:true,message:operation==='name'?'Your name has been updated.':'Account change saved.'};
}
