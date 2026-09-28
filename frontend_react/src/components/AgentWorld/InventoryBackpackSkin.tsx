import {useId} from 'react';

/** Shared vector artwork; each backpack owns its gradient and texture IDs. */
export function InventoryBackpackSkin() {
    const id = useId();
    return (<svg className="inventory-backpack-skin" viewBox="0 0 600 720" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
<radialGradient id={id + '-cloth'} cx=".38" cy=".3" r=".8"><stop stopColor="#959575"/><stop offset=".45" stopColor="#646c51"/><stop offset=".8" stopColor="#3c4737"/><stop offset="1" stopColor="#202e27"/></radialGradient>
<linearGradient id={id + '-leather'} x1="0" x2="0" y2="1"><stop stopColor="#be996a"/><stop offset=".22" stopColor="#a77a4d"/><stop offset=".7" stopColor="#81512e"/><stop offset="1" stopColor="#492b1a"/></linearGradient>
<linearGradient id={id + '-edge'} x1="0" x2="1" y2="0"><stop stopColor="#3e2b1c"/><stop offset=".5" stopColor="#8c653c"/><stop offset="1" stopColor="#402c1c"/></linearGradient>
<linearGradient id={id + '-gold'} x1="0" x2=".6" y2="1"><stop stopColor="#f0d78a"/><stop offset=".4" stopColor="#b4964b"/><stop offset=".7" stopColor="#7c622e"/><stop offset="1" stopColor="#d4b567"/></linearGradient>
<radialGradient id={id + '-lining'}><stop stopColor="#71684a"/><stop offset="1" stopColor="#37372a"/></radialGradient>
<filter id={id + '-grain'}><feTurbulence baseFrequency=".55" numOctaves="3" seed="8" type="fractalNoise"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".14"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/><feBlend in="SourceGraphic" mode="multiply"/></filter>
<pattern id={id + '-weave'} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 1H5M1 0V5" stroke="#c1c795" opacity=".13" strokeWidth=".6"/></pattern>
</defs>

<path d="M112 153C66 80 57 128 59 223L49 567Q44 613 97 631" fill="none" stroke="#3f4030" strokeWidth="15"/>
<path d="M488 153C534 80 543 128 541 223L551 567Q556 613 503 631" fill="none" stroke="#3f4030" strokeWidth="15"/>
<path d="M243 86V52Q241 17 300 17Q359 17 357 52V86" fill="none" stroke="#382c20" strokeWidth="19"/>
<path d="M243 83V52Q241 20 300 20Q359 20 357 52V83" fill="none" stroke="#8f7149" strokeWidth="12"/>
<path d="M247 56Q249 27 300 27Q351 27 353 56" fill="none" stroke="#d4ba80" strokeWidth="2"/>

<g filter={`url(#${id}-grain)`}><path d="M82 257Q31 251 26 289L21 547Q21 580 78 586L115 547V290Z" fill={`url(#${id}-cloth)`} stroke="#302d21" strokeWidth="5"/>
<path d="M518 257Q569 251 574 289L579 547Q579 580 522 586L485 547V290Z" fill={`url(#${id}-cloth)`} stroke="#302d21" strokeWidth="5"/>
<path d="M26 305Q51 322 91 308L87 256Q32 253 26 281Z" fill={`url(#${id}-leather)`} stroke="#49351f" strokeWidth="4"/>
<path d="M574 305Q549 322 509 308L513 256Q568 253 574 281Z" fill={`url(#${id}-leather)`} stroke="#49351f" strokeWidth="4"/>
</g>
<path d="M34 342L30 537Q30 557 69 566M566 342L570 537Q570 557 531 566" fill="none" stroke="#afb084" strokeWidth="2" strokeDasharray="4 5"/>
<path d="M41 363L66 383L39 405L67 428L38 452L67 477L37 503M559 363L534 383L561 405L533 428L562 452L533 477L563 503" fill="none" stroke="#3b2c1e" strokeWidth="5"/>
<path d="M41 363L66 383L39 405L67 428L38 452L67 477L37 503M559 363L534 383L561 405L533 428L562 452L533 477L563 503" fill="none" stroke="#bda376" strokeWidth="2"/>

<path d="M144 105Q300 64 456 105Q511 128 519 216L532 529Q538 649 468 678Q300 722 132 678Q62 649 68 529L81 216Q89 128 144 105Z" fill="#222a20" stroke="#202319" strokeWidth="7" transform="translate(11 10)"/>

<path d="M144 105Q300 64 456 105Q511 128 519 216L532 529Q538 649 468 678Q300 722 132 678Q62 649 68 529L81 216Q89 128 144 105Z" fill={`url(#${id}-cloth)`} stroke="#302e22" strokeWidth="6" filter={`url(#${id}-grain)`}/>
<path d="M144 105Q300 64 456 105Q511 128 519 216L532 529Q538 649 468 678Q300 722 132 678Q62 649 68 529L81 216Q89 128 144 105Z" fill={`url(#${id}-weave)`}/>
<path d="M90 242L94 604Q95 650 132 667Q300 688 468 667Q505 650 506 604L510 242" fill="none" stroke="#c2bb89" strokeWidth="2" strokeDasharray="4 5" opacity=".7"/>
<path d="M113 275Q300 260 487 275L492 574Q299 603 108 574Z" fill={`url(#${id}-edge)`} stroke="#332b20" strokeWidth="4"/>
<path d="M108 286Q300 274 492 286L486 568Q300 591 114 568Z" fill={`url(#${id}-lining)`} stroke="#aa8c59" strokeWidth="2"/>

<path d="M102 249Q92 350 104 573" fill="none" stroke="#c5c795" strokeWidth="7" opacity=".32"/>
<path d="M497 251Q510 348 496 582" fill="none" stroke="#1d271b" strokeWidth="14" opacity=".45"/>
<path d="M120 590Q301 628 480 590" fill="none" stroke="#202a1d" strokeWidth="15" opacity=".33"/>
<path d="M122 599Q301 631 478 599" fill="none" stroke="#c5c28e" strokeWidth="3" opacity=".55"/>

<path d="M82 600Q300 641 518 600L514 637Q499 684 471 688Q300 709 129 688Q101 684 86 637Z" fill={`url(#${id}-leather)`} stroke="#432d1b" strokeWidth="4" filter={`url(#${id}-grain)`}/>
<path d="M95 623Q300 657 505 623M124 677Q300 699 476 677" fill="none" stroke="#d2b784" strokeWidth="2" strokeDasharray="4 5"/>



<path d="M88 122Q300 61 523 124L509 236Q300 287 101 236Z" fill="#13170d" opacity=".38"/>
<path d="M81 108Q300 42 519 108L502 227Q300 276 98 227Z" fill="#25251c" opacity=".3" transform="translate(0 8)"/>
<path d="M99 102Q300 48 501 102L487 207Q479 227 459 230Q300 268 141 230Q121 227 113 207Z" fill={`url(#${id}-leather)`} stroke="#47331f" strokeWidth="5" filter={`url(#${id}-grain)`}/>
<path d="M112 111Q300 63 488 111L475 205Q300 253 125 205Z" fill="none" stroke="#d3b57c" strokeWidth="2" strokeDasharray="4 5"/>
<path d="M101 102Q300 56 499 102" stroke="#e2c591" strokeWidth="2" fill="none" opacity=".6"/>
<path d="M103 217Q300 263 499 218" fill="none" stroke="#3d2917" strokeWidth="9"/>
<path d="M106 214Q300 258 496 215" fill="none" stroke="#c39c61" strokeWidth="3"/>

<g fill={`url(#${id}-edge)`} stroke="#33251a" strokeWidth="3"><path d="M133 95Q150 84 167 95L174 252Q156 267 138 252Z"/><path d="M433 95Q450 84 467 95L462 252Q444 267 426 252Z"/></g>
<g fill="none" stroke="#cdb781" strokeWidth="1" strokeDasharray="3 4"><path d="M139 99L144 247M160 99L167 247M440 99L433 247M460 99L455 247"/></g>
<g fill={`url(#${id}-gold)`} stroke="#47391e" strokeWidth="2"><rect x="133" y="196" width="43" height="36" rx="6"/><rect x="424" y="196" width="43" height="36" rx="6"/></g>
<g fill="#563e27"><rect x="141" y="203" width="27" height="21" rx="2"/><rect x="432" y="203" width="27" height="21" rx="2"/></g>
<path d="M155 199V229M446 199V229" stroke="#dec17d" strokeWidth="4"/>
<g fill="#d0b06d" stroke="#514025"><circle cx="151" cy="104" r="4"/><circle cx="450" cy="104" r="4"/><circle cx="153" cy="245" r="4"/><circle cx="446" cy="245" r="4"/></g>

<path d="M518 179Q559 176 546 223L550 247" stroke="#b69a65" strokeWidth="3" fill="none"/>
<path d="M534 240L561 236L573 289L545 295Z" fill={`url(#${id}-leather)`} stroke="#3d2c1c" strokeWidth="2"/>
<path d="M547 252L555 249M549 260L560 257M551 267L561 265" stroke="#c5ac7e" strokeWidth="2"/>
</svg>);
}
