from pathlib import Path
root=Path.cwd().resolve();text=(root/'scripts/prepare-array-camera-realtime-delta-1011.py').read_text(encoding='utf8')
text=text.replace('original-array-camera-realtime-delta-root-1011','original-array-camera-realtime-delta-root-003-1011')
before=' ("},130);return()=>clearTimeout(timer);", "});return()=>cancelAnimationFrame(frame);"),'
assert text.count(before)==2
text=text.replace(before,' ("}},130);", "}});"),\n ("return ()=>clearTimeout(timer);", "return ()=>cancelAnimationFrame(frame);"),',1)
split=text.index("edit('src/components/YoshimuraMiuraCP2534Dialog.tsx'")
a=text[:split];b=text[split:]
b=b.replace('("const timer=setTimeout(()=>", "const frame=requestAnimationFrame(()=>")','("timer=setTimeout(()=>", "frame=requestAnimationFrame(()=>")')
b=b.replace(before,' ("},150);", "});"),\n ("clearTimeout(timer);", "cancelAnimationFrame(frame);"),')
text=a+b
target=root/'output/parallel/camera-realtime-prepare-003-1011.py';assert not target.exists();target.write_text(text,encoding='utf8',newline='\n')
exec(compile(text,str(target),'exec'))
