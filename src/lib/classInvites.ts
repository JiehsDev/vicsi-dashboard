/** Only the student class-join destination survives sign-in/signup; never accept arbitrary redirects. */
export function classJoinReturnPath(value:unknown):string|null {
  if(typeof value!=="string")return null;
  try{
    const url=new URL(value,"https://vicsi.invalid");
    if(url.origin!=="https://vicsi.invalid"||url.pathname!=="/results/classes/join")return null;
    const token=url.searchParams.get("invite"),code=normalizeClassCode(url.searchParams.get("code")??"");
    if(token&&/^[a-f0-9]{64}$/.test(token))return `/results/classes/join?invite=${token}`;
    if(/^[A-HJ-NP-Z2-9]{10}$/.test(code))return `/results/classes/join?code=${code}`;
  }catch{/* Invalid destinations are ignored. */}
  return null;
}
export function normalizeClassCode(value:string){return value.toUpperCase().replace(/[\s-]/g,"");}
export function classInviteMessage(status:string){
  if(status==="rate_limited")return "Too many attempts. Please wait 10 minutes before trying again.";
  if(status==="student_only")return "Sign in with a student account to join this class.";
  if(status==="invalid")return "This class code or invite link is unavailable. Check it or ask your instructor for a new one.";
  return "We couldn't load the class invitation. Please try again.";
}
