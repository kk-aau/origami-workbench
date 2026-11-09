/** Explicit navigation only. A settings link never claims the whole source group is complete. */
export function catalogSettings(id:string):'display'|'shortcuts'|null{
 if(['h_senhaba_sageAction','lineWidthDecreaseAction','antiAliasToggleAction','pref-185','pref-186','preciseZoomAction','pref-189'].includes(id))return 'display';
 if(['pref-191','pref-195'].includes(id))return 'shortcuts';
 return null;
}
