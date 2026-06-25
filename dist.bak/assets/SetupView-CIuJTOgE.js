import{B as T,s as w,o as d,c as b,r as S,a as h,m as f,f as J,h as U,Y as A,z as L,b as M,d as y,w as o,e as s,t as x,g as z,n as N,i as R,v as H,T as ne,F as W,j as re,u as ie,k as V,l as D,p as le,q as l,x as i,y as C,A as P,C as pe}from"./index-BicwD4MM.js";import{s as E,a as F,b as q}from"./index-CP9cuoVp.js";import{s as _}from"./index-7r979BSp.js";import{s as j,a as B}from"./index-Bo1N15G-.js";import{s as oe}from"./index-C4HXYpjR.js";var de=`
    .p-steplist {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 0;
        padding: 0;
        list-style-type: none;
        overflow-x: auto;
    }

    .p-step {
        position: relative;
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        gap: dt('stepper.step.gap');
        padding: dt('stepper.step.padding');
    }

    .p-step:last-of-type {
        flex: initial;
    }

    .p-step-header {
        border: 0 none;
        display: inline-flex;
        align-items: center;
        text-decoration: none;
        cursor: pointer;
        transition:
            background dt('stepper.transition.duration'),
            color dt('stepper.transition.duration'),
            border-color dt('stepper.transition.duration'),
            outline-color dt('stepper.transition.duration'),
            box-shadow dt('stepper.transition.duration');
        border-radius: dt('stepper.step.header.border.radius');
        outline-color: transparent;
        background: transparent;
        padding: dt('stepper.step.header.padding');
        gap: dt('stepper.step.header.gap');
    }

    .p-step-header:focus-visible {
        box-shadow: dt('stepper.step.header.focus.ring.shadow');
        outline: dt('stepper.step.header.focus.ring.width') dt('stepper.step.header.focus.ring.style') dt('stepper.step.header.focus.ring.color');
        outline-offset: dt('stepper.step.header.focus.ring.offset');
    }

    .p-stepper.p-stepper-readonly .p-step {
        cursor: auto;
    }

    .p-step-title {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        color: dt('stepper.step.title.color');
        font-weight: dt('stepper.step.title.font.weight');
        transition:
            background dt('stepper.transition.duration'),
            color dt('stepper.transition.duration'),
            border-color dt('stepper.transition.duration'),
            box-shadow dt('stepper.transition.duration'),
            outline-color dt('stepper.transition.duration');
    }

    .p-step-number {
        display: flex;
        align-items: center;
        justify-content: center;
        color: dt('stepper.step.number.color');
        border: 2px solid dt('stepper.step.number.border.color');
        background: dt('stepper.step.number.background');
        min-width: dt('stepper.step.number.size');
        height: dt('stepper.step.number.size');
        line-height: dt('stepper.step.number.size');
        font-size: dt('stepper.step.number.font.size');
        z-index: 1;
        border-radius: dt('stepper.step.number.border.radius');
        position: relative;
        font-weight: dt('stepper.step.number.font.weight');
    }

    .p-step-number::after {
        content: ' ';
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: dt('stepper.step.number.border.radius');
        box-shadow: dt('stepper.step.number.shadow');
    }

    .p-step-active .p-step-header {
        cursor: default;
    }

    .p-step-active .p-step-number {
        background: dt('stepper.step.number.active.background');
        border-color: dt('stepper.step.number.active.border.color');
        color: dt('stepper.step.number.active.color');
    }

    .p-step-active .p-step-title {
        color: dt('stepper.step.title.active.color');
    }

    .p-step:not(.p-disabled):focus-visible {
        outline: dt('focus.ring.width') dt('focus.ring.style') dt('focus.ring.color');
        outline-offset: dt('focus.ring.offset');
    }

    .p-step:has(~ .p-step-active) .p-stepper-separator {
        background: dt('stepper.separator.active.background');
    }

    .p-stepper-separator {
        flex: 1 1 0;
        background: dt('stepper.separator.background');
        width: 100%;
        height: dt('stepper.separator.size');
        transition:
            background dt('stepper.transition.duration'),
            color dt('stepper.transition.duration'),
            border-color dt('stepper.transition.duration'),
            box-shadow dt('stepper.transition.duration'),
            outline-color dt('stepper.transition.duration');
    }

    .p-steppanels {
        padding: dt('stepper.steppanels.padding');
    }

    .p-steppanel {
        background: dt('stepper.steppanel.background');
        color: dt('stepper.steppanel.color');
    }

    .p-stepper:has(.p-stepitem) {
        display: flex;
        flex-direction: column;
    }

    .p-stepitem {
        display: flex;
        flex-direction: column;
        flex: initial;
    }

    .p-stepitem.p-stepitem-active {
        flex: 1 1 auto;
    }

    .p-stepitem .p-step {
        flex: initial;
    }
    
    .p-stepitem .p-steppanel {
        display: grid;
        grid-template-rows: 1fr;
    }

    .p-stepitem .p-steppanel-content-wrapper {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
    }
    .p-stepitem .p-steppanel-content {
        width: 100%;
        padding: dt('stepper.steppanel.padding');
        margin-inline-start: 1rem;
    }

    .p-stepitem .p-stepper-separator {
        flex: 0 0 auto;
        width: dt('stepper.separator.size');
        height: auto;
        margin: dt('stepper.separator.margin');
        position: relative;
        left: calc(-1 * dt('stepper.separator.size'));
    }

    .p-stepitem .p-stepper-separator:dir(rtl) {
        left: calc(-9 * dt('stepper.separator.size'));
    }

    .p-stepitem:has(~ .p-stepitem-active) .p-stepper-separator {
        background: dt('stepper.separator.active.background');
    }

    .p-stepitem:last-of-type .p-steppanel {
        padding-inline-start: dt('stepper.step.number.size');
    }
`,ce={root:function(t){var r=t.props;return["p-stepper p-component",{"p-readonly":r.linear}]},separator:"p-stepper-separator"},ue=T.extend({name:"stepper",style:de,classes:ce}),ve={name:"BaseStepper",extends:w,props:{value:{type:[String,Number],default:void 0},linear:{type:Boolean,default:!1}},style:ue,provide:function(){return{$pcStepper:this,$parentInstance:this}}},Y={name:"Stepper",extends:ve,inheritAttrs:!1,emits:["update:value"],data:function(){return{d_value:this.value}},watch:{value:function(t){this.d_value=t}},methods:{updateValue:function(t){this.d_value!==t&&(this.d_value=t,this.$emit("update:value",t))},isStepActive:function(t){return this.d_value===t},isStepDisabled:function(){return this.linear}}};function fe(e,t,r,p,m,a){return d(),b("div",f({class:e.cx("root"),role:"tablist"},e.ptmi("root")),[e.$slots.start?S(e.$slots,"start",{key:0}):h("",!0),S(e.$slots,"default"),e.$slots.end?S(e.$slots,"end",{key:1}):h("",!0)],16)}Y.render=fe;var me={root:"p-steplist"},he=T.extend({name:"steplist",classes:me}),be={name:"BaseStepList",extends:w,style:he,provide:function(){return{$pcStepList:this,$parentInstance:this}}},G={name:"StepList",extends:be,inheritAttrs:!1};function Se(e,t,r,p,m,a){return d(),b("div",f({class:e.cx("root")},e.ptmi("root")),[S(e.$slots,"default")],16)}G.render=Se;var ge={root:"p-steppanels"},ye=T.extend({name:"steppanels",classes:ge}),xe={name:"BaseStepPanels",extends:w,style:ye,provide:function(){return{$pcStepPanels:this,$parentInstance:this}}},K={name:"StepPanels",extends:xe,inheritAttrs:!1};function $e(e,t,r,p,m,a){return d(),b("div",f({class:e.cx("root")},e.ptmi("root")),[S(e.$slots,"default")],16)}K.render=$e;var ke={root:function(t){var r=t.instance;return["p-step",{"p-step-active":r.active,"p-disabled":r.isStepDisabled}]},header:"p-step-header",number:"p-step-number",title:"p-step-title"},Ce=T.extend({name:"step",classes:ke}),Q={name:"StepperSeparator",hostName:"Stepper",extends:w,inject:{$pcStepper:{default:null}}};function we(e,t,r,p,m,a){return d(),b("span",f({class:e.cx("separator")},e.ptmo(a.$pcStepper.pt,"separator")),null,16)}Q.render=we;var Ve={name:"BaseStep",extends:w,props:{value:{type:[String,Number],default:void 0},disabled:{type:Boolean,default:!1},asChild:{type:Boolean,default:!1},as:{type:[String,Object],default:"DIV"}},style:Ce,provide:function(){return{$pcStep:this,$parentInstance:this}}},I={name:"Step",extends:Ve,inheritAttrs:!1,inject:{$pcStepper:{default:null},$pcStepList:{default:null},$pcStepItem:{default:null}},data:function(){return{isSeparatorVisible:!1,isCompleted:!1}},mounted:function(){if(this.$el&&this.$pcStepList){var t=U(this.$el,A(this.$pcStepper.$el,'[data-pc-name="step"]')),r=U(L(this.$pcStepper.$el,'[data-pc-name="step"][data-p-active="true"]'),A(this.$pcStepper.$el,'[data-pc-name="step"]')),p=A(this.$pcStepper.$el,'[data-pc-name="step"]').length;this.isSeparatorVisible=t!==p-1,this.isCompleted=t<r}},updated:function(){var t=U(this.$el,A(this.$pcStepper.$el,'[data-pc-name="step"]')),r=U(L(this.$pcStepper.$el,'[data-pc-name="step"][data-p-active="true"]'),A(this.$pcStepper.$el,'[data-pc-name="step"]'));this.isCompleted=t<r},methods:{getPTOptions:function(t){var r=t==="root"?this.ptmi:this.ptm;return r(t,{context:{active:this.active,disabled:this.isStepDisabled}})},onStepClick:function(){this.$pcStepper.updateValue(this.activeValue)}},computed:{active:function(){return this.$pcStepper.isStepActive(this.activeValue)},activeValue:function(){var t;return this.$pcStepItem?(t=this.$pcStepItem)===null||t===void 0?void 0:t.value:this.value},isStepDisabled:function(){return!this.active&&(this.$pcStepper.isStepDisabled()||this.disabled)},id:function(){var t;return"".concat((t=this.$pcStepper)===null||t===void 0?void 0:t.$id,"_step_").concat(this.activeValue)},ariaControls:function(){var t;return"".concat((t=this.$pcStepper)===null||t===void 0?void 0:t.$id,"_steppanel_").concat(this.activeValue)},a11yAttrs:function(){return{root:{role:"presentation","aria-current":this.active?"step":void 0,"data-pc-name":"step","data-pc-section":"root","data-p-disabled":this.isStepDisabled,"data-p-active":this.active},header:{id:this.id,role:"tab",taindex:this.disabled?-1:void 0,"aria-controls":this.ariaControls,"data-pc-section":"header",disabled:this.isStepDisabled,onClick:this.onStepClick}}},dataP:function(){return J({disabled:this.isStepDisabled,readonly:this.$pcStepper.linear,active:this.active,completed:this.isCompleted,vertical:this.$pcStepItem!=null})}},components:{StepperSeparator:Q}},Pe=["id","tabindex","aria-controls","disabled","data-p"],Ae=["data-p"],Ue=["data-p"];function Te(e,t,r,p,m,a){var c=M("StepperSeparator");return e.asChild?S(e.$slots,"default",{key:1,class:N(e.cx("root")),active:a.active,value:e.value,a11yAttrs:a.a11yAttrs,activateCallback:a.onStepClick}):(d(),y(z(e.as),f({key:0,class:e.cx("root"),"aria-current":a.active?"step":void 0,role:"presentation","data-p-active":a.active,"data-p-disabled":a.isStepDisabled,"data-p":a.dataP},a.getPTOptions("root")),{default:o(function(){return[s("button",f({id:a.id,class:e.cx("header"),role:"tab",type:"button",tabindex:a.isStepDisabled?-1:void 0,"aria-controls":a.ariaControls,disabled:a.isStepDisabled,onClick:t[0]||(t[0]=function(){return a.onStepClick&&a.onStepClick.apply(a,arguments)}),"data-p":a.dataP},a.getPTOptions("header")),[s("span",f({class:e.cx("number"),"data-p":a.dataP},a.getPTOptions("number")),x(a.activeValue),17,Ae),s("span",f({class:e.cx("title"),"data-p":a.dataP},a.getPTOptions("title")),[S(e.$slots,"default")],16,Ue)],16,Pe),m.isSeparatorVisible?(d(),y(c,{key:0,"data-p":a.dataP},null,8,["data-p"])):h("",!0)]}),_:3},16,["class","aria-current","data-p-active","data-p-disabled","data-p"]))}I.render=Te;var _e={root:function(t){var r=t.instance;return["p-steppanel",{"p-steppanel-active":r.isVertical&&r.active}]},contentWrapper:"p-steppanel-content-wrapper",content:"p-steppanel-content"},Ie=T.extend({name:"steppanel",classes:_e}),X={name:"StepperSeparator",hostName:"Stepper",extends:w,inject:{$pcStepper:{default:null}}};function Oe(e,t,r,p,m,a){return d(),b("span",f({class:e.cx("separator")},e.ptmo(a.$pcStepper.pt,"separator")),null,16)}X.render=Oe;var De={name:"BaseStepPanel",extends:w,props:{value:{type:[String,Number],default:void 0},asChild:{type:Boolean,default:!1},as:{type:[String,Object],default:"DIV"}},style:Ie,provide:function(){return{$pcStepPanel:this,$parentInstance:this}}},O={name:"StepPanel",extends:De,inheritAttrs:!1,inject:{$pcStepper:{default:null},$pcStepItem:{default:null},$pcStepList:{default:null}},data:function(){return{isSeparatorVisible:!1}},mounted:function(){if(this.$el){var t,r,p=A(this.$pcStepper.$el,'[data-pc-name="step"]'),m=L(this.isVertical?(t=this.$pcStepItem)===null||t===void 0?void 0:t.$el:(r=this.$pcStepList)===null||r===void 0?void 0:r.$el,'[data-pc-name="step"]'),a=U(m,p);this.isSeparatorVisible=this.isVertical&&a!==p.length-1}},methods:{getPTOptions:function(t){var r=t==="root"?this.ptmi:this.ptm;return r(t,{context:{active:this.active}})},updateValue:function(t){this.$pcStepper.updateValue(t)}},computed:{active:function(){var t,r,p=this.$pcStepItem?(t=this.$pcStepItem)===null||t===void 0?void 0:t.value:this.value;return p===((r=this.$pcStepper)===null||r===void 0?void 0:r.d_value)},isVertical:function(){return!!this.$pcStepItem},activeValue:function(){var t;return this.isVertical?(t=this.$pcStepItem)===null||t===void 0?void 0:t.value:this.value},id:function(){var t;return"".concat((t=this.$pcStepper)===null||t===void 0?void 0:t.$id,"_steppanel_").concat(this.activeValue)},ariaControls:function(){var t;return"".concat((t=this.$pcStepper)===null||t===void 0?void 0:t.$id,"_step_").concat(this.activeValue)},a11yAttrs:function(){return{id:this.id,role:"tabpanel","aria-controls":this.ariaControls,"data-pc-name":"steppanel","data-p-active":this.active}},ptParams:function(){return{context:{active:this.active}}},dataP:function(){return J({vertical:this.$pcStepItem!=null})}},components:{StepperSeparator:X}},je=["data-p"];function Be(e,t,r,p,m,a){var c=M("StepperSeparator");return a.isVertical?(d(),b(W,{key:0},[e.asChild?S(e.$slots,"default",{key:1,active:a.active,a11yAttrs:a.a11yAttrs,activateCallback:function(u){return a.updateValue(u)}}):(d(),y(ne,f({key:0,name:"p-collapsible"},e.ptm("transition")),{default:o(function(){return[R((d(),y(z(e.as),f({id:a.id,class:e.cx("root"),role:"tabpanel","aria-controls":a.ariaControls,"data-p":a.dataP},a.getPTOptions("root")),{default:o(function(){return[s("div",f({class:e.cx("contentWrapper")},e.ptm("contentWrapper",a.ptParams)),[m.isSeparatorVisible?(d(),y(c,{key:0,"data-p":a.dataP},null,8,["data-p"])):h("",!0),s("div",f({class:e.cx("content"),"data-p":a.dataP},a.getPTOptions("content")),[S(e.$slots,"default",{active:a.active,activateCallback:function(u){return a.updateValue(u)}})],16,je)],16)]}),_:3},16,["id","class","aria-controls","data-p"])),[[H,a.active]])]}),_:3},16))],64)):(d(),b(W,{key:1},[e.asChild?e.asChild&&a.active?S(e.$slots,"default",{key:1,active:a.active,a11yAttrs:a.a11yAttrs,activateCallback:function(u){return a.updateValue(u)}}):h("",!0):R((d(),y(z(e.as),f({key:0,id:a.id,class:e.cx("root"),role:"tabpanel","aria-controls":a.ariaControls},a.getPTOptions("root")),{default:o(function(){return[S(e.$slots,"default",{active:a.active,activateCallback:function(u){return a.updateValue(u)}})]}),_:3},16,["id","class","aria-controls"])),[[H,a.active]])],64))}O.render=Be;const Le={class:"min-h-screen flex items-center justify-center p-6"},ze={class:"w-full max-w-2xl relative z-10"},Ne={class:"py-6 space-y-6"},Re={class:"space-y-4"},He={class:"flex justify-end"},We={class:"py-6 space-y-6"},Ee={class:"flex items-center justify-between"},Fe={class:"flex items-center gap-3"},qe={class:"font-medium"},Je={class:"text-sm text-[var(--color-text-muted)]"},Me={class:"space-y-1"},Ye={key:0,class:"text-sm"},Ge={key:0,class:"ml-2"},Ke={key:1,class:"text-[var(--color-text-muted)] mt-1"},Qe={class:"text-sm mt-1"},Xe={class:"flex justify-between"},Ze={class:"py-6 space-y-6"},et={class:"grid grid-cols-2 gap-4 text-sm"},tt={class:"font-mono truncate"},at={class:"font-mono truncate"},st={class:"flex justify-between"},ot=re({__name:"SetupView",setup(e){const t=pe(),r=ie(),p=V({adminUrl:r.config.adminUrl||"http://localhost:8081",oauthUrl:r.config.oauthUrl||"http://localhost:8080"}),m=V("1"),a=V(!1),c=V("idle"),$=V(""),u=V(null),Z=D(()=>window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1"?!1:p.value.adminUrl.startsWith("http://")||p.value.oauthUrl.startsWith("http://")),ee=D(()=>p.value.adminUrl&&p.value.oauthUrl),te=D(()=>c.value==="success");async function ae(){a.value=!0,c.value="idle",$.value="",u.value=null;try{const v=await fetch(`${p.value.adminUrl}/api/admin/dashboard/health`);if(v.status===401||v.status===403){if(!(v.headers.get("content-type")||"").includes("application/json"))throw new Error(`HTTP ${v.status}: unexpected response (not JSON — check URL)`);u.value={status:"reachable",note:"Server requires authentication (expected)",version:"N/A"},c.value="success";return}if(!v.ok)throw new Error(`HTTP ${v.status}: ${v.statusText}`);const n=await v.json();u.value=n,c.value="success"}catch(v){$.value=v.name==="TypeError"&&v.message.includes("fetch")?"Cannot reach server. Check URL and ensure server is running.":v.message||"Failed to connect to Admin API",c.value="error"}finally{a.value=!1}}function se(){r.updateConfig({adminUrl:p.value.adminUrl,oauthUrl:p.value.oauthUrl,setupCompleted:!0}),t.push("/login")}return(v,n)=>(d(),b("div",Le,[n[21]||(n[21]=s("div",{class:"fixed inset-0 overflow-hidden pointer-events-none"},[s("div",{class:"absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-accent-primary)] opacity-5 rounded-full blur-3xl"}),s("div",{class:"absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-accent-cyan)] opacity-5 rounded-full blur-3xl"})],-1)),s("div",ze,[n[20]||(n[20]=le('<div class="text-center mb-10 animate-slide-in"><div class="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-cyan)] flex items-center justify-center glow-blue"><i class="pi pi-shield text-4xl text-white"></i></div><h1 class="text-4xl font-bold gradient-text mb-3">Security Monitor</h1><p class="text-[var(--color-text-secondary)] text-lg">Connect to your OAuth2 Admin API</p></div>',1)),l(i(j),{class:"animate-fade-in"},{content:o(()=>[l(i(Y),{value:m.value,"onUpdate:value":n[2]||(n[2]=g=>m.value=g),linear:""},{default:o(()=>[l(i(G),null,{default:o(()=>[l(i(I),{value:"1"},{default:o(()=>[...n[3]||(n[3]=[C("Server",-1)])]),_:1}),l(i(I),{value:"2"},{default:o(()=>[...n[4]||(n[4]=[C("Verify",-1)])]),_:1}),l(i(I),{value:"3"},{default:o(()=>[...n[5]||(n[5]=[C("Connect",-1)])]),_:1})]),_:1}),l(i(K),null,{default:o(()=>[l(i(O),{value:"1"},{default:o(({activateCallback:g})=>[s("div",Ne,[n[11]||(n[11]=s("div",{class:"flex items-center gap-3 mb-6"},[s("i",{class:"pi pi-server text-2xl text-[var(--color-accent-primary)]"}),s("div",null,[s("h3",{class:"text-xl font-semibold"},"Server URLs"),s("p",{class:"text-sm text-[var(--color-text-muted)]"},"Enter your OAuth2 server addresses")])],-1)),Z.value?(d(),y(i(_),{key:0,severity:"warn",closable:!1},{default:o(()=>[...n[6]||(n[6]=[C(" HTTP (non-HTTPS) URLs detected in a non-localhost environment. Use HTTPS in production to protect token transmission. ",-1)])]),_:1})):h("",!0),s("div",Re,[s("div",null,[n[7]||(n[7]=s("label",{class:"block text-sm font-medium text-[var(--color-text-secondary)] mb-2"},"Admin API URL",-1)),l(i(E),null,{default:o(()=>[l(i(F),{class:"pi pi-server"}),l(i(q),{modelValue:p.value.adminUrl,"onUpdate:modelValue":n[0]||(n[0]=k=>p.value.adminUrl=k),placeholder:"http://localhost:8081",class:"w-full"},null,8,["modelValue"])]),_:1}),n[8]||(n[8]=s("small",{class:"text-[var(--color-text-muted)]"},"Port 8081 — Admin/monitoring endpoints",-1))]),s("div",null,[n[9]||(n[9]=s("label",{class:"block text-sm font-medium text-[var(--color-text-secondary)] mb-2"},"OAuth2 Server URL",-1)),l(i(E),null,{default:o(()=>[l(i(F),{class:"pi pi-lock"}),l(i(q),{modelValue:p.value.oauthUrl,"onUpdate:modelValue":n[1]||(n[1]=k=>p.value.oauthUrl=k),placeholder:"http://localhost:8080",class:"w-full"},null,8,["modelValue"])]),_:1}),n[10]||(n[10]=s("small",{class:"text-[var(--color-text-muted)]"},"Port 8080 — OAuth2/OIDC endpoints",-1))])]),l(i(B)),s("div",He,[l(i(P),{label:"Continue",icon:"pi pi-arrow-right",iconPos:"right",disabled:!ee.value,onClick:k=>g("2")},null,8,["disabled","onClick"])])])]),_:1}),l(i(O),{value:"2"},{default:o(({activateCallback:g})=>[s("div",We,[n[15]||(n[15]=s("div",{class:"flex items-center gap-3 mb-6"},[s("i",{class:"pi pi-wifi text-2xl text-[var(--color-accent-primary)]"}),s("div",null,[s("h3",{class:"text-xl font-semibold"},"Verify Connection"),s("p",{class:"text-sm text-[var(--color-text-muted)]"},"Test connectivity to Admin API")])],-1)),l(i(j),{class:"bg-[var(--color-surface-100)]"},{content:o(()=>[s("div",Ee,[s("div",Fe,[s("div",{class:N(["w-10 h-10 rounded-full flex items-center justify-center",{"bg-[var(--color-status-secure)]":c.value==="success","bg-[var(--color-status-danger)]":c.value==="error","bg-[var(--color-surface-300)]":c.value==="idle"}])},[s("i",{class:N(["pi text-white",c.value==="success"?"pi-check":c.value==="error"?"pi-times":"pi-server"])},null,2)],2),s("div",null,[s("div",qe,x(p.value.adminUrl),1),s("div",Je,x(c.value==="success"?"Connected":c.value==="error"?"Failed":"Ready to test"),1)])]),l(i(P),{label:a.value?"Testing...":"Test",icon:a.value?"pi pi-spin pi-spinner":"pi pi-bolt",disabled:a.value,onClick:ae,severity:c.value==="success"?"success":"secondary"},null,8,["label","icon","disabled","severity"])])]),_:1}),c.value==="success"?(d(),y(i(_),{key:0,severity:"success",closable:!1},{default:o(()=>[s("div",Me,[n[13]||(n[13]=s("div",{class:"font-semibold"},"Connection Verified",-1)),u.value?(d(),b("div",Ye,[s("span",null,[n[12]||(n[12]=C("Status: ",-1)),l(i(oe),{value:u.value.status,severity:u.value.status==="healthy"?"success":"info"},null,8,["value","severity"])]),u.value.version!=="N/A"?(d(),b("span",Ge,"Version: "+x(u.value.version),1)):h("",!0),u.value.note?(d(),b("div",Ke,x(u.value.note),1)):h("",!0)])):h("",!0)])]),_:1})):h("",!0),c.value==="error"?(d(),y(i(_),{key:1,severity:"error",closable:!1},{default:o(()=>[n[14]||(n[14]=s("div",{class:"font-semibold"},"Connection Failed",-1)),s("div",Qe,x($.value),1)]),_:1})):h("",!0),l(i(B)),s("div",Xe,[l(i(P),{label:"Back",icon:"pi pi-arrow-left",severity:"secondary",outlined:"",onClick:k=>g("1")},null,8,["onClick"]),l(i(P),{label:"Continue",icon:"pi pi-arrow-right",iconPos:"right",disabled:!te.value,onClick:k=>g("3")},null,8,["disabled","onClick"])])])]),_:1}),l(i(O),{value:"3"},{default:o(({activateCallback:g})=>[s("div",Ze,[n[19]||(n[19]=s("div",{class:"flex items-center gap-3 mb-6"},[s("i",{class:"pi pi-check-square text-2xl text-[var(--color-accent-primary)]"}),s("div",null,[s("h3",{class:"text-xl font-semibold"},"Ready to Connect"),s("p",{class:"text-sm text-[var(--color-text-muted)]"},"OAuth2 client credentials can be configured after sign-in")])],-1)),l(i(j),{class:"bg-[var(--color-surface-100)]"},{content:o(()=>[s("div",et,[s("div",null,[n[16]||(n[16]=s("div",{class:"text-[var(--color-text-muted)] text-xs uppercase tracking-wide mb-1"},"Admin URL",-1)),s("div",tt,x(p.value.adminUrl),1)]),s("div",null,[n[17]||(n[17]=s("div",{class:"text-[var(--color-text-muted)] text-xs uppercase tracking-wide mb-1"},"OAuth URL",-1)),s("div",at,x(p.value.oauthUrl),1)])])]),_:1}),l(i(_),{severity:"info",closable:!1},{default:o(()=>[...n[18]||(n[18]=[C(" OAuth2 client credentials (Client ID, Secret, Scopes) are loaded from environment variables and can be adjusted in ",-1),s("strong",null,"Settings",-1),C(" after sign-in. ",-1)])]),_:1}),l(i(B)),s("div",st,[l(i(P),{label:"Back",icon:"pi pi-arrow-left",severity:"secondary",outlined:"",onClick:k=>g("2")},null,8,["onClick"]),l(i(P),{label:"Save & Sign In",icon:"pi pi-check",onClick:se})])])]),_:1})]),_:1})]),_:1},8,["value"])]),_:1})])]))}});export{ot as default};
