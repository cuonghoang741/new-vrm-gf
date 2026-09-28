# web-legal

The public legal pages: https://truemate.netlify.app

Netlify site `truemate` (team `cuonghpc-work`), id `ca521539-51d9-424b-a63e-7f05d2e7ad5a`.
Plain static HTML, no build step. Netlify serves `/privacy` from `privacy.html`.

Redeploy after editing:

    cd web-legal
    zip -qr /tmp/legal.zip . -x README.md
    curl -X POST -H "Authorization: Bearer $NETLIFY_TOKEN" \
         -H "Content-Type: application/zip" --data-binary @/tmp/legal.zip \
         https://api.netlify.com/api/v1/sites/ca521539-51d9-424b-a63e-7f05d2e7ad5a/deploys

The app links to `/privacy`, `/terms` and `/eula` from `SignInScreen.tsx`,
`SettingsSheet.tsx` and `SubscriptionSheet.tsx`. `/data-deletion` is what the
Play listing and the Facebook app settings point at.

Note: the team had `account_sso_login: true`, which made every site on it
answer 401 to the public. Turning it off is what made these pages reachable.
