import{B as u,s as y,o as i,c as o,m as r,r as d,a,e as v,f as b}from"./index-BicwD4MM.js";var g=`
    .p-card {
        background: dt('card.background');
        color: dt('card.color');
        box-shadow: dt('card.shadow');
        border-radius: dt('card.border.radius');
        display: flex;
        flex-direction: column;
    }

    .p-card-caption {
        display: flex;
        flex-direction: column;
        gap: dt('card.caption.gap');
    }

    .p-card-body {
        padding: dt('card.body.padding');
        display: flex;
        flex-direction: column;
        gap: dt('card.body.gap');
    }

    .p-card-title {
        font-size: dt('card.title.font.size');
        font-weight: dt('card.title.font.weight');
    }

    .p-card-subtitle {
        color: dt('card.subtitle.color');
    }
`,h={root:"p-card p-component",header:"p-card-header",body:"p-card-body",caption:"p-card-caption",title:"p-card-title",subtitle:"p-card-subtitle",content:"p-card-content",footer:"p-card-footer"},m=u.extend({name:"card",style:g,classes:h}),$={name:"BaseCard",extends:y,style:m,provide:function(){return{$pcCard:this,$parentInstance:this}}},k={name:"Card",extends:$,inheritAttrs:!1};function z(t,n,e,s,f,p){return i(),o("div",r({class:t.cx("root")},t.ptmi("root")),[t.$slots.header?(i(),o("div",r({key:0,class:t.cx("header")},t.ptm("header")),[d(t.$slots,"header")],16)):a("",!0),v("div",r({class:t.cx("body")},t.ptm("body")),[t.$slots.title||t.$slots.subtitle?(i(),o("div",r({key:0,class:t.cx("caption")},t.ptm("caption")),[t.$slots.title?(i(),o("div",r({key:0,class:t.cx("title")},t.ptm("title")),[d(t.$slots,"title")],16)):a("",!0),t.$slots.subtitle?(i(),o("div",r({key:1,class:t.cx("subtitle")},t.ptm("subtitle")),[d(t.$slots,"subtitle")],16)):a("",!0)],16)):a("",!0),v("div",r({class:t.cx("content")},t.ptm("content")),[d(t.$slots,"content")],16),t.$slots.footer?(i(),o("div",r({key:1,class:t.cx("footer")},t.ptm("footer")),[d(t.$slots,"footer")],16)):a("",!0)],16)],16)}k.render=z;var S=`
    .p-divider-horizontal {
        display: flex;
        width: 100%;
        position: relative;
        align-items: center;
        margin: dt('divider.horizontal.margin');
        padding: dt('divider.horizontal.padding');
    }

    .p-divider-horizontal:before {
        position: absolute;
        display: block;
        inset-block-start: 50%;
        inset-inline-start: 0;
        width: 100%;
        content: '';
        border-block-start: 1px solid dt('divider.border.color');
    }

    .p-divider-horizontal .p-divider-content {
        padding: dt('divider.horizontal.content.padding');
    }

    .p-divider-vertical {
        min-height: 100%;
        display: flex;
        position: relative;
        justify-content: center;
        margin: dt('divider.vertical.margin');
        padding: dt('divider.vertical.padding');
    }

    .p-divider-vertical:before {
        position: absolute;
        display: block;
        inset-block-start: 0;
        inset-inline-start: 50%;
        height: 100%;
        content: '';
        border-inline-start: 1px solid dt('divider.border.color');
    }

    .p-divider.p-divider-vertical .p-divider-content {
        padding: dt('divider.vertical.content.padding');
    }

    .p-divider-content {
        z-index: 1;
        background: dt('divider.content.background');
        color: dt('divider.content.color');
    }

    .p-divider-solid.p-divider-horizontal:before {
        border-block-start-style: solid;
    }

    .p-divider-solid.p-divider-vertical:before {
        border-inline-start-style: solid;
    }

    .p-divider-dashed.p-divider-horizontal:before {
        border-block-start-style: dashed;
    }

    .p-divider-dashed.p-divider-vertical:before {
        border-inline-start-style: dashed;
    }

    .p-divider-dotted.p-divider-horizontal:before {
        border-block-start-style: dotted;
    }

    .p-divider-dotted.p-divider-vertical:before {
        border-inline-start-style: dotted;
    }

    .p-divider-left:dir(rtl),
    .p-divider-right:dir(rtl) {
        flex-direction: row-reverse;
    }
`,P={root:function(n){var e=n.props;return{justifyContent:e.layout==="horizontal"?e.align==="center"||e.align===null?"center":e.align==="left"?"flex-start":e.align==="right"?"flex-end":null:null,alignItems:e.layout==="vertical"?e.align==="center"||e.align===null?"center":e.align==="top"?"flex-start":e.align==="bottom"?"flex-end":null:null}}},w={root:function(n){var e=n.props;return["p-divider p-component","p-divider-"+e.layout,"p-divider-"+e.type,{"p-divider-left":e.layout==="horizontal"&&(!e.align||e.align==="left")},{"p-divider-center":e.layout==="horizontal"&&e.align==="center"},{"p-divider-right":e.layout==="horizontal"&&e.align==="right"},{"p-divider-top":e.layout==="vertical"&&e.align==="top"},{"p-divider-center":e.layout==="vertical"&&(!e.align||e.align==="center")},{"p-divider-bottom":e.layout==="vertical"&&e.align==="bottom"}]},content:"p-divider-content"},B=u.extend({name:"divider",style:S,classes:w,inlineStyles:P}),C={name:"BaseDivider",extends:y,props:{align:{type:String,default:null},layout:{type:String,default:"horizontal"},type:{type:String,default:"solid"}},style:B,provide:function(){return{$pcDivider:this,$parentInstance:this}}};function l(t){"@babel/helpers - typeof";return l=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(n){return typeof n}:function(n){return n&&typeof Symbol=="function"&&n.constructor===Symbol&&n!==Symbol.prototype?"symbol":typeof n},l(t)}function c(t,n,e){return(n=j(n))in t?Object.defineProperty(t,n,{value:e,enumerable:!0,configurable:!0,writable:!0}):t[n]=e,t}function j(t){var n=D(t,"string");return l(n)=="symbol"?n:n+""}function D(t,n){if(l(t)!="object"||!t)return t;var e=t[Symbol.toPrimitive];if(e!==void 0){var s=e.call(t,n);if(l(s)!="object")return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return(n==="string"?String:Number)(t)}var I={name:"Divider",extends:C,inheritAttrs:!1,computed:{dataP:function(){return b(c(c(c({},this.align,this.align),this.layout,this.layout),this.type,this.type))}}},N=["aria-orientation","data-p"],x=["data-p"];function A(t,n,e,s,f,p){return i(),o("div",r({class:t.cx("root"),style:t.sx("root"),role:"separator","aria-orientation":t.layout,"data-p":p.dataP},t.ptmi("root")),[t.$slots.default?(i(),o("div",r({key:0,class:t.cx("content"),"data-p":p.dataP},t.ptm("content")),[d(t.$slots,"default")],16,x)):a("",!0)],16,N)}I.render=A;export{I as a,k as s};
