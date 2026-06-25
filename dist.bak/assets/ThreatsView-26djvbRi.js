import{B as W,s as K,f as J,o as l,c as o,m as L,r as Q,a as f,y,t as r,j as X,G as Y,I as Z,M as ee,k as x,l as te,D as se,e,q as n,x as a,A as _,n as A,F as $,J as V,w as b,L as H,d as N,i as ae,N as re,O as j,K as ne}from"./index-BicwD4MM.js";import{u as le}from"./en-US-BZU_wGTp.js";import{s as P}from"./index-C4HXYpjR.js";import{b as ie,s as oe,a as B,c as de}from"./index-CBZeqEMB.js";import{b as ue}from"./index-CP9cuoVp.js";import{s as ce}from"./index-zxkAeGsx.js";import{s as ve}from"./index-DZ5BMbOA.js";import{s as R}from"./index-Db_ykIp4.js";import{f as F}from"./format-rSbTc3fa.js";import{f as pe}from"./formatDistanceToNow-DSHEBwOP.js";import"./endOfMonth-BVTaYdjA.js";var me=`
    .p-progressbar {
        display: block;
        position: relative;
        overflow: hidden;
        height: dt('progressbar.height');
        background: dt('progressbar.background');
        border-radius: dt('progressbar.border.radius');
    }

    .p-progressbar-value {
        margin: 0;
        background: dt('progressbar.value.background');
    }

    .p-progressbar-label {
        color: dt('progressbar.label.color');
        font-size: dt('progressbar.label.font.size');
        font-weight: dt('progressbar.label.font.weight');
    }

    .p-progressbar-determinate .p-progressbar-value {
        height: 100%;
        width: 0%;
        position: absolute;
        display: none;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        transition: width 1s ease-in-out;
    }

    .p-progressbar-determinate .p-progressbar-label {
        display: inline-flex;
    }

    .p-progressbar-indeterminate .p-progressbar-value::before {
        content: '';
        position: absolute;
        background: inherit;
        inset-block-start: 0;
        inset-inline-start: 0;
        inset-block-end: 0;
        will-change: inset-inline-start, inset-inline-end;
        animation: p-progressbar-indeterminate-anim 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
    }

    .p-progressbar-indeterminate .p-progressbar-value::after {
        content: '';
        position: absolute;
        background: inherit;
        inset-block-start: 0;
        inset-inline-start: 0;
        inset-block-end: 0;
        will-change: inset-inline-start, inset-inline-end;
        animation: p-progressbar-indeterminate-anim-short 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) infinite;
        animation-delay: 1.15s;
    }

    @keyframes p-progressbar-indeterminate-anim {
        0% {
            inset-inline-start: -35%;
            inset-inline-end: 100%;
        }
        60% {
            inset-inline-start: 100%;
            inset-inline-end: -90%;
        }
        100% {
            inset-inline-start: 100%;
            inset-inline-end: -90%;
        }
    }
    @-webkit-keyframes p-progressbar-indeterminate-anim {
        0% {
            inset-inline-start: -35%;
            inset-inline-end: 100%;
        }
        60% {
            inset-inline-start: 100%;
            inset-inline-end: -90%;
        }
        100% {
            inset-inline-start: 100%;
            inset-inline-end: -90%;
        }
    }

    @keyframes p-progressbar-indeterminate-anim-short {
        0% {
            inset-inline-start: -200%;
            inset-inline-end: 100%;
        }
        60% {
            inset-inline-start: 107%;
            inset-inline-end: -8%;
        }
        100% {
            inset-inline-start: 107%;
            inset-inline-end: -8%;
        }
    }
    @-webkit-keyframes p-progressbar-indeterminate-anim-short {
        0% {
            inset-inline-start: -200%;
            inset-inline-end: 100%;
        }
        60% {
            inset-inline-start: 107%;
            inset-inline-end: -8%;
        }
        100% {
            inset-inline-start: 107%;
            inset-inline-end: -8%;
        }
    }
`,be={root:function(u){var g=u.instance;return["p-progressbar p-component",{"p-progressbar-determinate":g.determinate,"p-progressbar-indeterminate":g.indeterminate}]},value:"p-progressbar-value",label:"p-progressbar-label"},fe=W.extend({name:"progressbar",style:me,classes:be}),ge={name:"BaseProgressBar",extends:K,props:{value:{type:Number,default:null},mode:{type:String,default:"determinate"},showValue:{type:Boolean,default:!0}},style:fe,provide:function(){return{$pcProgressBar:this,$parentInstance:this}}},z={name:"ProgressBar",extends:ge,inheritAttrs:!1,computed:{progressStyle:function(){return{width:this.value+"%",display:"flex"}},indeterminate:function(){return this.mode==="indeterminate"},determinate:function(){return this.mode==="determinate"},dataP:function(){return J({determinate:this.determinate,indeterminate:this.indeterminate})}}},xe=["aria-valuenow","data-p"],_e=["data-p"],ye=["data-p"],he=["data-p"];function ke(i,u,g,k,M,m){return l(),o("div",L({role:"progressbar",class:i.cx("root"),"aria-valuemin":"0","aria-valuenow":i.value,"aria-valuemax":"100","data-p":m.dataP},i.ptmi("root")),[m.determinate?(l(),o("div",L({key:0,class:i.cx("value"),style:m.progressStyle,"data-p":m.dataP},i.ptm("value")),[i.value!=null&&i.value!==0&&i.showValue?(l(),o("div",L({key:0,class:i.cx("label"),"data-p":m.dataP},i.ptm("label")),[Q(i.$slots,"default",{},function(){return[y(r(i.value+"%"),1)]})],16,ye)):f("",!0)],16,_e)):m.indeterminate?(l(),o("div",L({key:1,class:i.cx("value"),"data-p":m.dataP},i.ptm("value")),null,16,he)):f("",!0)],16,xe)}z.render=ke;const we={class:"flex-1 overflow-y-auto p-6"},Ie={class:"flex items-center justify-between mb-6"},Pe={class:"flex items-center gap-3"},Me={class:"flex items-center gap-4"},Ce={class:"flex-1"},Le={class:"flex items-center gap-3"},$e={class:"text-xl font-bold"},Ve={class:"text-sm text-[var(--color-text-secondary)] mt-1"},Be={class:"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6"},De={class:"metric-card",style:{"--card-accent":"var(--color-accent-primary)"}},Se={class:"metric-value"},Te={class:"metric-card",style:{"--card-accent":"var(--color-status-critical)"}},Ee={class:"metric-value text-[var(--color-status-critical)]"},Re={class:"metric-card",style:{"--card-accent":"var(--color-status-danger)"}},Ue={class:"metric-value text-[var(--color-status-danger)]"},Ae={class:"metric-card",style:{"--card-accent":"var(--color-status-warning)"}},He={class:"metric-value text-[var(--color-status-warning)]"},Ne={class:"metric-card",style:{"--card-accent":"var(--color-accent-secondary)"}},je={class:"metric-value"},Fe={class:"grid grid-cols-1 lg:grid-cols-2 gap-6"},ze={class:"panel"},Oe={class:"space-y-3"},qe={class:"flex items-center justify-between mb-2"},Ge={class:"font-medium"},We={class:"flex gap-4 text-xs text-[var(--color-text-muted)]"},Ke={key:0},Je={key:1},Qe={key:1,class:"text-center py-8 text-[var(--color-text-muted)]"},Xe={class:"panel"},Ye={class:"space-y-2"},Ze=["onClick"],et={class:"flex items-center justify-between"},tt={class:"font-mono font-medium"},st={class:"text-xs text-[var(--color-text-muted)] mt-1"},at={class:"flex items-center gap-2"},rt={class:"flex flex-wrap gap-1 max-w-32"},nt={key:1,class:"text-center py-8 text-[var(--color-text-muted)]"},lt={class:"panel lg:col-span-2"},it={class:"font-mono text-sm"},ot={class:"font-mono text-sm"},dt={key:0,class:"space-y-4"},ut={key:1,class:"space-y-6"},ct={class:"flex items-center justify-between"},vt={class:"font-mono text-xl font-bold"},pt={class:"text-sm text-[var(--color-text-muted)]"},mt={class:"flex items-center justify-between mb-2"},bt={class:"grid grid-cols-2 gap-4"},ft={class:"p-3 rounded-lg bg-[var(--color-surface-100)]"},gt={class:"text-2xl font-bold"},xt={class:"p-3 rounded-lg bg-[var(--color-surface-100)]"},_t={class:"text-2xl font-bold"},yt={class:"p-3 rounded-lg bg-[var(--color-surface-100)]"},ht={class:"text-2xl font-bold text-[var(--color-status-danger)]"},kt={class:"p-3 rounded-lg bg-[var(--color-surface-100)]"},wt={class:"text-2xl font-bold"},It={class:"space-y-2 max-h-48 overflow-y-auto"},Pt={class:"flex items-center justify-between"},Mt={class:"font-medium"},Ct={class:"text-xs text-[var(--color-text-muted)]"},Lt={key:0,class:"text-xs text-[var(--color-text-muted)]"},$t={class:"space-y-4"},Vt={class:"flex items-center gap-2"},Bt={key:0},zt=X({__name:"ThreatsView",setup(i){const u=Y(),g=le(),k=Z();ee();const M=x("24h"),m=[{label:"Last 15 Minutes",value:"15m"},{label:"Last Hour",value:"1h"},{label:"Last 24 Hours",value:"24h"},{label:"Last 7 Days",value:"7d"},{label:"Last 30 Days",value:"30d"}],O=x(null),d=x(null),w=x(!1),D=x(!1),I=x(!1),c=x({ip_address:"",reason:"",duration_hours:24,permanent:!1}),p=te(()=>{if(!u.threatMetrics)return{level:"unknown",color:"secondary",description:"Loading..."};const{critical_events:v,error_events:t,warning_events:E}=u.threatMetrics.summary;return v>0?{level:"CRITICAL",color:"danger",description:`${v} critical event(s) detected`}:t>5?{level:"HIGH",color:"warning",description:`${t} error events in the period`}:t>0||E>10?{level:"MEDIUM",color:"info",description:"Elevated activity detected"}:{level:"LOW",color:"success",description:"No significant threats"}});async function C(){try{await g.fetchThreatMetrics(M.value)}catch{k.add({severity:"error",summary:"Error",detail:"Failed to load threat data",life:3e3})}}async function q(v){O.value=v,w.value=!0,D.value=!0;try{d.value=await g.fetchIPReputation(v.ip_address)}catch{k.add({severity:"error",summary:"Error",detail:"Failed to load IP reputation",life:3e3})}finally{D.value=!1}}function S(v){c.value={ip_address:v||"",reason:"",duration_hours:24,permanent:!1},I.value=!0}async function G(){try{await g.blockIP({ip_address:c.value.ip_address,reason:c.value.reason,duration_hours:c.value.permanent?void 0:c.value.duration_hours,permanent:c.value.permanent}),k.add({severity:"success",summary:"Success",detail:"IP blocked successfully",life:3e3}),I.value=!1,w.value=!1,await C()}catch{k.add({severity:"error",summary:"Error",detail:"Failed to block IP",life:3e3})}}function U(v){return v>=75?"var(--color-status-critical)":v>=50?"var(--color-status-danger)":v>=25?"var(--color-status-warning)":"var(--color-status-secure)"}function T(v){return pe(new Date(v),{addSuffix:!0})}return se(()=>{C()}),(v,t)=>{const E=ne("tooltip");return l(),o("div",we,[e("div",Ie,[t[11]||(t[11]=e("div",null,[e("h1",{class:"text-2xl font-bold"},"Threat Intelligence"),e("p",{class:"text-[var(--color-text-muted)]"},"Security threat analysis and monitoring")],-1)),e("div",Pe,[n(a(ie),{modelValue:M.value,"onUpdate:modelValue":t[0]||(t[0]=s=>M.value=s),options:m,optionLabel:"label",optionValue:"value",onChange:C,class:"w-40"},null,8,["modelValue"]),n(a(_),{icon:"pi pi-refresh",severity:"secondary",text:"",rounded:"",onClick:C,loading:a(u).isLoading.threats},null,8,["loading"])])]),e("div",{class:A(["p-4 rounded-xl mb-6 border",{"bg-[var(--color-status-critical)]/10 border-[var(--color-status-critical)]/30":p.value.level==="CRITICAL","bg-[var(--color-status-danger)]/10 border-[var(--color-status-danger)]/30":p.value.level==="HIGH","bg-[var(--color-status-warning)]/10 border-[var(--color-status-warning)]/30":p.value.level==="MEDIUM","bg-[var(--color-status-secure)]/10 border-[var(--color-status-secure)]/30":p.value.level==="LOW","bg-[var(--color-surface-100)] border-[var(--color-border-subtle)]":p.value.level==="unknown"}])},[e("div",Me,[e("div",{class:A(["w-12 h-12 rounded-xl flex items-center justify-center",{"bg-[var(--color-status-critical)]":p.value.level==="CRITICAL","bg-[var(--color-status-danger)]":p.value.level==="HIGH","bg-[var(--color-status-warning)]":p.value.level==="MEDIUM","bg-[var(--color-status-secure)]":p.value.level==="LOW","bg-[var(--color-surface-300)]":p.value.level==="unknown"}])},[...t[12]||(t[12]=[e("i",{class:"pi pi-shield text-2xl text-white"},null,-1)])],2),e("div",Ce,[e("div",Le,[e("span",$e,"Threat Level: "+r(p.value.level),1),n(a(P),{value:p.value.level,severity:p.value.color},null,8,["value","severity"])]),e("p",Ve,r(p.value.description),1)]),n(a(_),{label:"Block IP",icon:"pi pi-ban",severity:"danger",outlined:"",onClick:t[1]||(t[1]=s=>S())})])],2),e("div",Be,[e("div",De,[e("div",Se,r(a(u).threatMetrics?.summary.total_events.toLocaleString()||"—"),1),t[13]||(t[13]=e("div",{class:"metric-label"},"Total Events",-1))]),e("div",Te,[e("div",Ee,r(a(u).threatMetrics?.summary.critical_events||0),1),t[14]||(t[14]=e("div",{class:"metric-label"},"Critical",-1))]),e("div",Re,[e("div",Ue,r(a(u).threatMetrics?.summary.error_events||0),1),t[15]||(t[15]=e("div",{class:"metric-label"},"Errors",-1))]),e("div",Ae,[e("div",He,r(a(u).threatMetrics?.summary.warning_events||0),1),t[16]||(t[16]=e("div",{class:"metric-label"},"Warnings",-1))]),e("div",Ne,[e("div",je,r(a(u).threatMetrics?.summary.unique_attackers||0),1),t[17]||(t[17]=e("div",{class:"metric-label"},"Unique Attackers",-1))])]),e("div",Fe,[e("div",ze,[t[22]||(t[22]=e("div",{class:"panel-header"},[e("i",{class:"pi pi-exclamation-triangle text-[var(--color-status-warning)]"}),y(" Top Threats ")],-1)),e("div",Oe,[a(u).threatMetrics?.top_threats.length?(l(!0),o($,{key:0},V(a(u).threatMetrics.top_threats,s=>(l(),o("div",{key:s.type,class:"p-3 rounded-lg bg-[var(--color-surface-100)] border border-[var(--color-border-subtle)]"},[e("div",qe,[e("span",Ge,r(s.type.replace(/_/g," ").toUpperCase()),1),n(a(P),{value:`${s.count} events`,severity:"danger"},null,8,["value"])]),e("div",We,[e("span",null,[t[18]||(t[18]=e("i",{class:"pi pi-globe mr-1"},null,-1)),y(r(s.unique_ips)+" IPs",1)]),s.affected_users?(l(),o("span",Ke,[t[19]||(t[19]=e("i",{class:"pi pi-users mr-1"},null,-1)),y(r(s.affected_users)+" users",1)])):f("",!0),s.affected_apps?(l(),o("span",Je,[t[20]||(t[20]=e("i",{class:"pi pi-box mr-1"},null,-1)),y(r(s.affected_apps)+" apps",1)])):f("",!0)])]))),128)):(l(),o("div",Qe,[...t[21]||(t[21]=[e("i",{class:"pi pi-check-circle text-3xl mb-2 text-[var(--color-status-secure)]"},null,-1),e("p",null,"No significant threats detected",-1)])]))])]),e("div",Xe,[t[24]||(t[24]=e("div",{class:"panel-header"},[e("i",{class:"pi pi-map-marker text-[var(--color-status-danger)]"}),y(" Suspicious IPs ")],-1)),e("div",Ye,[a(u).threatMetrics?.suspicious_ips.length?(l(!0),o($,{key:0},V(a(u).threatMetrics.suspicious_ips,s=>(l(),o("div",{key:s.ip_address,class:"p-3 rounded-lg bg-[var(--color-surface-100)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border)] transition-colors cursor-pointer",onClick:h=>q(s)},[e("div",et,[e("div",null,[e("div",tt,r(s.ip_address),1),e("div",st,r(s.event_count)+" events • Last seen "+r(T(s.last_seen)),1)]),e("div",at,[e("div",rt,[(l(!0),o($,null,V(s.event_types.slice(0,2),h=>(l(),N(a(P),{key:h,value:h,severity:"secondary",class:"text-xs"},null,8,["value"]))),128))]),ae(n(a(_),{icon:"pi pi-ban",severity:"danger",text:"",rounded:"",size:"small",onClick:re(h=>S(s.ip_address),["stop"])},null,8,["onClick"]),[[E,"Block IP",void 0,{top:!0}]])])])],8,Ze))),128)):(l(),o("div",nt,[...t[23]||(t[23]=[e("i",{class:"pi pi-check-circle text-3xl mb-2 text-[var(--color-status-secure)]"},null,-1),e("p",null,"No suspicious IPs detected",-1)])]))])]),e("div",lt,[t[26]||(t[26]=e("div",{class:"panel-header"},[e("i",{class:"pi pi-lock text-[var(--color-status-danger)]"}),y(" Locked Accounts ")],-1)),n(a(oe),{value:a(u).threatMetrics?.locked_accounts||[],loading:a(u).isLoading.threats,class:"data-table",stripedRows:""},{empty:b(()=>[...t[25]||(t[25]=[e("div",{class:"text-center py-8 text-[var(--color-text-muted)]"},[e("i",{class:"pi pi-check-circle text-3xl mb-2 text-[var(--color-status-secure)]"}),e("p",null,"No locked accounts")],-1)])]),default:b(()=>[n(a(B),{field:"email",header:"User"}),n(a(B),{field:"failed_attempts",header:"Failed Attempts"},{body:b(({data:s})=>[n(a(P),{value:s.failed_attempts,severity:"danger"},null,8,["value"])]),_:1}),n(a(B),{field:"locked_at",header:"Locked At"},{body:b(({data:s})=>[e("span",it,r(a(F)(new Date(s.locked_at),"MMM d, HH:mm")),1)]),_:1}),n(a(B),{field:"locked_until",header:"Locked Until"},{body:b(({data:s})=>[e("span",ot,r(a(F)(new Date(s.locked_until),"MMM d, HH:mm")),1)]),_:1})]),_:1},8,["value","loading"])])]),n(a(H),{visible:w.value,"onUpdate:visible":t[4]||(t[4]=s=>w.value=s),header:"IP Reputation",style:{width:"600px"},modal:""},{footer:b(()=>[n(a(_),{label:"Close",severity:"secondary",onClick:t[2]||(t[2]=s=>w.value=!1)}),d.value&&!d.value.is_blocked?(l(),N(a(_),{key:0,label:"Block IP",icon:"pi pi-ban",severity:"danger",onClick:t[3]||(t[3]=s=>S(d.value.ip_address))})):f("",!0)]),default:b(()=>[D.value?(l(),o("div",dt,[n(a(R),{width:"100%",height:"24px"}),n(a(R),{width:"100%",height:"100px"}),n(a(R),{width:"100%",height:"150px"})])):d.value?(l(),o("div",ut,[e("div",ct,[e("div",null,[e("div",vt,r(d.value.ip_address),1),e("div",pt," First seen "+r(T(d.value.first_seen)),1)]),n(a(P),{value:d.value.is_blocked?"BLOCKED":"ACTIVE",severity:d.value.is_blocked?"danger":"warning"},null,8,["value","severity"])]),e("div",null,[e("div",mt,[t[27]||(t[27]=e("span",{class:"text-sm text-[var(--color-text-muted)]"},"Risk Score",-1)),e("span",{class:"font-bold",style:j({color:U(d.value.risk_score)})},r(d.value.risk_score)+"/100 ",5)]),n(a(z),{value:d.value.risk_score,showValue:!1,style:j({"--p-progressbar-value-background":U(d.value.risk_score)})},null,8,["value","style"])]),e("div",bt,[e("div",ft,[e("div",gt,r(d.value.events_24h),1),t[28]||(t[28]=e("div",{class:"text-xs text-[var(--color-text-muted)]"},"Events (24h)",-1))]),e("div",xt,[e("div",_t,r(d.value.events_7d),1),t[29]||(t[29]=e("div",{class:"text-xs text-[var(--color-text-muted)]"},"Events (7d)",-1))]),e("div",yt,[e("div",ht,r(d.value.failed_logins_24h),1),t[30]||(t[30]=e("div",{class:"text-xs text-[var(--color-text-muted)]"},"Failed Logins (24h)",-1))]),e("div",kt,[e("div",wt,r(d.value.unique_users_targeted),1),t[31]||(t[31]=e("div",{class:"text-xs text-[var(--color-text-muted)]"},"Users Targeted",-1))])]),e("div",null,[t[32]||(t[32]=e("div",{class:"text-sm font-medium mb-2"},"Recent Events",-1)),e("div",It,[(l(!0),o($,null,V(d.value.recent_events,(s,h)=>(l(),o("div",{key:h,class:"p-2 rounded bg-[var(--color-surface-100)] text-sm"},[e("div",Pt,[e("span",Mt,r(s.event_type),1),e("span",Ct,r(T(s.created_at)),1)]),s.user_email?(l(),o("div",Lt,r(s.user_email),1)):f("",!0)]))),128))])])])):f("",!0)]),_:1},8,["visible"]),n(a(H),{visible:I.value,"onUpdate:visible":t[10]||(t[10]=s=>I.value=s),header:"Block IP Address",style:{width:"450px"},modal:""},{footer:b(()=>[n(a(_),{label:"Cancel",severity:"secondary",onClick:t[9]||(t[9]=s=>I.value=!1)}),n(a(_),{label:"Block IP",icon:"pi pi-ban",severity:"danger",onClick:G,disabled:!c.value.ip_address||!c.value.reason},null,8,["disabled"])]),default:b(()=>[e("div",$t,[e("div",null,[t[33]||(t[33]=e("label",{class:"block text-sm font-medium mb-1"},"IP Address",-1)),n(a(ue),{modelValue:c.value.ip_address,"onUpdate:modelValue":t[5]||(t[5]=s=>c.value.ip_address=s),class:"w-full",placeholder:"203.0.113.50"},null,8,["modelValue"])]),e("div",null,[t[34]||(t[34]=e("label",{class:"block text-sm font-medium mb-1"},"Reason",-1)),n(a(ce),{modelValue:c.value.reason,"onUpdate:modelValue":t[6]||(t[6]=s=>c.value.reason=s),class:"w-full",rows:"3",placeholder:"Reason for blocking..."},null,8,["modelValue"])]),e("div",Vt,[n(a(ve),{modelValue:c.value.permanent,"onUpdate:modelValue":t[7]||(t[7]=s=>c.value.permanent=s),inputId:"permanent",binary:""},null,8,["modelValue"]),t[35]||(t[35]=e("label",{for:"permanent",class:"text-sm"},"Permanent block",-1))]),c.value.permanent?f("",!0):(l(),o("div",Bt,[t[36]||(t[36]=e("label",{class:"block text-sm font-medium mb-1"},"Duration (hours)",-1)),n(a(de),{modelValue:c.value.duration_hours,"onUpdate:modelValue":t[8]||(t[8]=s=>c.value.duration_hours=s),class:"w-full",min:1,max:8760},null,8,["modelValue"])]))])]),_:1},8,["visible"])])}}});export{zt as default};
