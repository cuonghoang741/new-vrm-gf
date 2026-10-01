#!/usr/bin/env python3
"""
Repaint a character render as 2D anime key art with OpenRouter.

The reference is a posed VRM render over its scene (tools/vroid/render +
card_art.compose), so hair, face and outfit stay the model's. Use
google/gemini-3.1-flash-image: gemini-3-pro-image restyled too freely (it
changed a silver-haired girl to pink). Check every result for invented text
(titles, star ratings) and hair colour, and regenerate if needed.

    OPENROUTER_API_KEY=... python3 ai_repaint.py in.jpg out.jpg google/gemini-3.1-flash-image
"""
import json,base64,urllib.request,io,sys
from PIL import Image
import os
key=os.environ.get("OPENROUTER_API_KEY") or sys.exit("set OPENROUTER_API_KEY (SECRETS.local.md)")
PROMPT=("Repaint this character as a brand-new, gorgeous 2D anime illustration in the style of premium gacha game key art "
"(like Genshin Impact or Blue Archive splash art). This must NOT look like a 3D render: hand-painted 2D, clean confident line art, "
"soft cel shading with painterly highlights, big detailed sparkling eyes with an attractive cute expression, glossy flowing hair with strands, "
"cinematic rim light and bloom, a richly painted background of the same place. "
"Keep her character design recognisable: same hair colour and hairstyle, same outfit design and colours, same accessories (glasses etc). "
"You may improve the pose to be more charming and dynamic, and her proportions to a beautiful idealised anime figure. "
"She is an adult woman (20s). Tasteful, fully clothed as in the reference, no nudity. Vertical portrait, full body or knee-up. Absolutely NO text, letters, titles, logos, stars, UI or watermarks anywhere in the image.")
def gen(src, out, model):
    im=Image.open(src).convert("RGB"); im.thumbnail((768,1200)); buf=io.BytesIO(); im.save(buf,"JPEG",quality=90)
    body={"model":model,"messages":[{"role":"user","content":[{"type":"text","text":PROMPT},{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,"+base64.b64encode(buf.getvalue()).decode()}}]}],"modalities":["image","text"]}
    r=urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",data=json.dumps(body).encode(),headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"},method="POST")
    d=json.load(urllib.request.urlopen(r,timeout=300))
    imgs=d["choices"][0]["message"].get("images") or []
    if not imgs: raise RuntimeError("no image: "+str(d)[:300])
    Image.open(io.BytesIO(base64.b64decode(imgs[0]["image_url"]["url"].split(",",1)[1]))).convert("RGB").save(out,quality=92)
if __name__=="__main__":
    gen(sys.argv[1],sys.argv[2],sys.argv[3])
