"use client";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {useEffect,useRef,type ComponentProps} from "react";
import {fetchDashboardSummary} from "./use-dashboard-summary";
import {VISIBLE_SPORTS,type DashboardSport} from "@/lib/dashboard-contract";
/** Keep the persistent header still while cross-fading only the route surface. */
export function SportLink(props:ComponentProps<typeof Link>){
 const router=useRouter(),pathname=usePathname(),finish=useRef<(()=>void)|null>(null);
 useEffect(()=>{finish.current?.();finish.current=null},[pathname]);
 useEffect(()=>()=>{finish.current?.()},[]);
 const warm=()=>{const sport=String(props.href).split("/")[1] as DashboardSport;if(VISIBLE_SPORTS.includes(sport))fetchDashboardSummary(sport).catch(()=>{})};
 return <Link {...props} prefetch onPointerEnter={warm} onFocus={warm} onNavigate={event=>{
  if(typeof props.href!=="string"||props.href===pathname)return;
  const doc=document as Document&{startViewTransition?:(update:()=>Promise<void>)=>{finished:Promise<void>}};
  if(!doc.startViewTransition||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  event.preventDefault();finish.current?.();
  const transition=doc.startViewTransition(()=>new Promise<void>(resolve=>{
   const timer=window.setTimeout(resolve,1500);
   finish.current=()=>{window.clearTimeout(timer);resolve()};
   router.push(props.href as string,{scroll:false});
  }));
  transition.finished.catch(()=>{});
 }}/>
}
