import json, subprocess, os
F=os.path.expanduser('~/.local/bin/ffmpeg')
t=json.load(open('timeline.json')); S=t['start']; E=t['end']; D=E-S
ins=['-i','desk.webm','-i','phone.webm']; fc=[]; n=2
# видео
pa,pu=t['phoneAt']-S, t['phoneUntil']-S; ps=t['phoneClipStart']
fc.append(f"[0:v]trim=start={S}:duration={D},setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos[d]")
fc.append(f"[1:v]trim=start={ps},setpts=PTS-STARTPTS+{pa}/TB,scale=-2:980[ph]")
fc.append(f"color=c=0xf3efe7:s=1920x1080:r=30:d={D}[bg]")
fc.append(f"[d][bg]overlay=enable='between(t,{pa},{pu})'[d2]")
fc.append(f"[d2][ph]overlay=x=(W-w)/2:y=50:enable='between(t,{pa},{pu})':eof_action=pass[v]")
# звук
mix=[]
for v in t['voice']:
    ins+=['-i',v['id']+'.mp3']; d=int((v['at']-S)*1000)
    fc.append(f"[{n}:a]adelay={d}|{d},volume=1.0[a{n}]"); mix.append(f"[a{n}]"); n+=1
for m in t['music']:
    ins+=['-i',m['file']]; d=int((m['at']-S)*1000); L=m['until']-m['at']
    fc.append(f"[{n}:a]atrim=start={m['offset']}:duration={L},afade=t=in:d=0.4,afade=t=out:st={max(0,L-1.2)}:d=1.2,volume=0.42,adelay={d}|{d}[a{n}]"); mix.append(f"[a{n}]"); n+=1
bed=t['music'][0]['file']
ins+=['-i',bed]; L1=t['music'][0]['at']-S
fc.append(f"[{n}:a]atrim=start=4:duration={L1},afade=t=in:d=1,afade=t=out:st={L1-1.5}:d=1.5,volume=0.16[a{n}]"); mix.append(f"[a{n}]"); n+=1
ins+=['-i',bed]; o=pa; L2=D-pa
fc.append(f"[{n}:a]atrim=start=10:duration={L2},afade=t=in:d=1.5,afade=t=out:st={L2-2.5}:d=2.5,volume=0.2,adelay={int(o*1000)}|{int(o*1000)}[a{n}]"); mix.append(f"[a{n}]"); n+=1
fc.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:dropout_transition=0,atrim=duration={D},alimiter=limit=0.95[a]")
cmd=[F,'-v','error','-y',*ins,'-filter_complex',';'.join(fc),'-map','[v]','-map','[a]','-c:v','libx264','-preset','slow','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-t',str(D),'demo.mp4']
subprocess.run(cmd,check=True); print('ok', D)
