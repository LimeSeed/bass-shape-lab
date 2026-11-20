// Self-authored synthetic bass phrase: no recording or third-party media.
export function demoFile(): File {
 const sr=44100,duration=16,n=sr*duration,bytes=new ArrayBuffer(44+n*2),v=new DataView(bytes);
 const text=(o:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 text(0,'RIFF');v.setUint32(4,36+n*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,n*2,true);
 const notes=[55,55,82.4069,73.4162,65.4064,65.4064,49,55,55,110,82.4069,73.4162,65.4064,49,51.9131,55];
 for(let i=0;i<n;i++){const t=i/sr,k=Math.floor(t*2),p=t%0.5,f=notes[k%notes.length],env=Math.min(1,p/.012)*Math.exp(-p*5)*Math.min(1,(.5-p)/.03); const x=env*(.48*Math.sin(2*Math.PI*f*t)+.16*Math.sin(4*Math.PI*f*t)+.07*Math.sin(6*Math.PI*f*t));v.setInt16(44+i*2,x*32767,true);}
 return new File([bytes],'贝斯示例.wav',{type:'audio/wav'});
}
