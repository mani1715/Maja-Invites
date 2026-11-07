import {useEffect, useRef} from 'react';

// One bounded canvas, capped resolution and frame rate; no animation work offscreen.
export default function HomeAtmosphere({paused}) {
  const ref=useRef(null);
  useEffect(()=>{
    const canvas=ref.current, context=canvas.getContext('2d');
    if(!context)return;
    let width=0,height=0,frame=0,last=0,time=0,visible=true;
    const petals=Array.from({length:22},(_,i)=>({x:((i*137.5)%100)/100,y:((i*43)%100)/100,size:5+(i%5)*1.6,speed:9+(i%7)*2,phase:i*1.7}));
    const resize=()=>{const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);draw();};
    function draw(){
      context.clearRect(0,0,width,height);
      // Gentle horizontal refraction of the supplied lake, never a full-scene filter.
      const scene=canvas.closest('section')?.querySelector('.pxh-world img');
      if(scene?.complete&&scene.naturalWidth){
        const scale=Math.max(width/scene.naturalWidth,height/scene.naturalHeight);
        const drawnWidth=scene.naturalWidth*scale,drawnHeight=scene.naturalHeight*scale;
        const left=(width-drawnWidth)/2,top=(height-drawnHeight)/2;
        const waterTop=height*.77,strip=(height-waterTop)/(width<600?20:32);
        context.save();context.globalAlpha=.60;
        context.beginPath();context.rect(0,waterTop,width,height-waterTop);context.clip();
        for(let y=waterTop;y<height;y+=strip){
          const offset=Math.sin(time*.9+y*.07)*1.8+Math.sin(time*.43+y*.025)*1.1;
          context.drawImage(scene,0,(y-top)/scale,scene.naturalWidth,strip/scale,left+offset,y,drawnWidth,strip+.4);
        }
        context.restore();
      }
      // Thin expanding water contours follow the horizon, preserving the artwork beneath.
      const horizon=height*.70;
      context.save();context.beginPath();context.rect(0,horizon,width,height-horizon);context.clip();
      for(let i=0;i<26;i++){
        const progress=((i/26+time*.011)%1),radius=35+progress*width*.68;
        const cy=horizon+height*.09+progress*height*.10;
        context.beginPath();context.ellipse(width*.51+Math.sin(time*.17+i)*8,cy,radius,8+progress*height*.11,0,0,Math.PI*2);
        context.strokeStyle=`rgba(248,234,255,${(1-progress)*.20})`;context.lineWidth=.6+progress*.6;context.stroke();
      }
      context.restore();
      petals.slice(0,width<600?12:22).forEach(p=>{
        const y=(p.y*height+time*p.speed)%(height+40)-20;
        const x=p.x*width+Math.sin(time*.23+p.phase)*32+Math.sin(y/200+p.phase)*15;
        context.save();context.translate(x,y);context.rotate(p.phase+time*.25);context.scale(.65+Math.abs(Math.sin(time*.4+p.phase))*.35,1);
        context.beginPath();context.moveTo(0,-p.size);context.bezierCurveTo(p.size*1.1,-p.size*.7,p.size*.8,p.size*.7,0,p.size);context.bezierCurveTo(-p.size*.7,p.size*.3,-p.size*.45,-p.size*.6,0,-p.size);
        const fill=context.createLinearGradient(-p.size,-p.size,p.size,p.size);fill.addColorStop(0,'rgba(254,226,255,.8)');fill.addColorStop(1,'rgba(159,109,205,.45)');context.fillStyle=fill;context.fill();context.restore();
      });
    }
    function tick(now){frame=0;if(paused||!visible||document.hidden)return;if(now-last>33){time+=Math.min((now-last)/1000,.08);last=now;draw();}frame=requestAnimationFrame(tick);}
    const resume=()=>{if(frame)cancelAnimationFrame(frame);frame=0;last=performance.now();if(!paused&&visible&&!document.hidden)frame=requestAnimationFrame(tick);};
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;resume();});observer.observe(canvas);
    const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(canvas);
    document.addEventListener('visibilitychange',resume);resize();resume();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();sizeObserver.disconnect();document.removeEventListener('visibilitychange',resume);};
  },[paused]);
  return <div className="pxh-atmosphere" aria-hidden="true"><div className="pxh-cloud pxh-cloud-one"/><div className="pxh-cloud pxh-cloud-two"/><canvas ref={ref}/></div>;
}
