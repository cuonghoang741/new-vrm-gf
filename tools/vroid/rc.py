#!/usr/bin/env python3
"""Read / create / set Firebase Remote Config parameters for truemate-e3401.

The service-account JSON is NOT in the repo. Point FIREBASE_SA_JSON_PATH at it
(Firebase console → Project settings → Service accounts → Generate key).
"""
import json, os, sys, time, base64, urllib.request

SA = os.environ.get("FIREBASE_SA_JSON_PATH", "firebase-service-account.json")
sa = json.load(open(SA))
PROJECT = sa["project_id"]

def b64(b):
    if isinstance(b, str): b = b.encode()
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def token():
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    now = int(time.time())
    claim = {"iss": sa["client_email"], "scope": "https://www.googleapis.com/auth/firebase.remoteconfig",
             "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600}
    msg = f'{b64(json.dumps({"alg":"RS256","typ":"JWT"}))}.{b64(json.dumps(claim))}'
    key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
    sig = key.sign(msg.encode(), padding.PKCS1v15(), hashes.SHA256())
    jwt = f"{msg}.{b64(sig)}"
    req = urllib.request.Request("https://oauth2.googleapis.com/token",
        data=urllib.parse.urlencode({"grant_type":"urn:ietf:params:oauth:grant-type:jwt-bearer","assertion":jwt}).encode(),
        headers={"Content-Type":"application/x-www-form-urlencoded"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())["access_token"]

import urllib.parse
URL = f"https://firebaseremoteconfig.googleapis.com/v1/projects/{PROJECT}/remoteConfig"

def get(tok):
    req = urllib.request.Request(URL, headers={"Authorization": "Bearer " + tok})
    r = urllib.request.urlopen(req, timeout=30)
    return json.loads(r.read()), (r.headers.get("ETag") or r.headers.get("etag") or "*")

def put(tok, cfg, etag):
    req = urllib.request.Request(URL, data=json.dumps(cfg).encode(), method="PUT",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json; UTF-8", "If-Match": etag})
    return urllib.request.urlopen(req, timeout=30).status

if __name__ == "__main__":
    tok = token()
    cfg, etag = get(tok)
    params = cfg.setdefault("parameters", {})
    if sys.argv[1] == "list":
        for k, v in sorted(params.items()):
            print(k, "=", v.get("defaultValue", {}).get("value"))
    else:
        for pair in sys.argv[1:]:
            k, _, v = pair.partition("=")
            existing = params.get(k, {})
            existing["defaultValue"] = {"value": v}
            existing.setdefault("valueType", "BOOLEAN" if v in ("true","false") else "STRING")
            params[k] = existing
        print("status", put(tok, cfg, etag))
