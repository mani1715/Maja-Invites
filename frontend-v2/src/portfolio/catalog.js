// Stable commercial IDs. A renderer version changes composition, never eligibility.
export const DESIGNS = [
  ['free_studio_neutral','Studio Neutral','free','Minimal','All specialties','neutral'],
  ['basic_golden_hour','Golden Hour','basic','Editorial','Wedding · Portrait · Maternity','golden'],
  ['basic_darkroom','Darkroom','basic','Cinematic','Wedding · Events · Fashion','darkroom'],
  ['basic_nordic','Nordic Light','basic','Minimal','Portrait · Product · Maternity','nordic'],
  ['premium_gallery_wall','Gallery Wall','premium','Gallery','Portrait · Travel · Wildlife','wall'],
  ['premium_film_strip','Film Strip','premium','Cinematic','Wedding · Events · Cinematography','film'],
  ['premium_liquid_glass','Liquid Glass','premium','Contemporary','Fashion · Product · Portrait','glass'],
  ['premium_contact_sheet','Contact Sheet','premium','Gallery','Events · Travel · Portrait','contact'],
  ['premium_aurora','Aurora Studio','premium','Contemporary','Fashion · Product · Corporate','aurora'],
  ['premium_editorial','Editorial / Folio','premium','Editorial','Wedding · Fashion · Portrait','folio'],
].map(([id,name,tier,style,categories,key])=>({id,name,tier,style,categories,key}));
export const accessLabel = tier => tier==='free'?'Every studio':tier==='basic'?'Basic, Pro, Advanced, Premium, Custom':'Pro, Advanced, Premium, Custom';
export const allowedDesign = (id,tier) => ({normal:0,free:0,basic:1,premium:2}[tier]??0)>=({free:0,basic:1,premium:2}[DESIGNS.find(d=>d.id===id)?.tier]??99);
export function vocabulary(profile={}) {
  const explicit=profile.presentation?.vocabulary;
  const styles=(profile.styles||[]).join(' ').toLowerCase();
  const type=(explicit&&explicit!=='auto'?explicit:null)||(/product|fashion|corporate/.test(styles)?'projects':/portrait|maternity/.test(styles)?'sessions':/wedding/.test(styles)?'stories':'work');
  return {label:{projects:'Projects',sessions:'Sessions',stories:'Stories',work:'Selected work'}[type]||'Selected work',event:type==='stories'?'celebration':type==='sessions'?'session':'project'};
}
