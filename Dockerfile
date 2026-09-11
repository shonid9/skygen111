FROM nginx:alpine
COPY . /usr/share/nginx/html/

# Keep one consistent brand mark on every page, including older page templates.
RUN find /usr/share/nginx/html -name '*.html' -type f -exec sed -i 's#<span class="mark">E1</span>#<img class="brandLogo" src="/logo-emet-one.svg" alt="EMET ONE">#g' {} + \
 && find /usr/share/nginx/html -name '*.html' -type f -exec sed -i 's#<img src="/logo-emet-one.svg" alt="EMET ONE" style="width:48px;height:48px;display:block;object-fit:contain;flex:0 0 auto">#<img class="brandLogo" src="/logo-emet-one.svg" alt="EMET ONE">#g' {} + \
 && cat >> /usr/share/nginx/html/styles.css <<'EOF'

/* EMET ONE brand lockup */
.brand{gap:10px;min-width:max-content}
.brandLogo{display:block;width:38px;height:38px;object-fit:contain;flex:0 0 38px;transform:none!important;filter:none}
.brand:hover .brandLogo{transform:none!important}
.brand>span{display:block;line-height:1}
.brand strong{font-size:15px;line-height:1.05;letter-spacing:-.045em}
.brand small{margin-top:4px;font-size:7px;line-height:1;letter-spacing:.105em}
@media(max-width:760px){
  .navin{gap:12px}
  .brand{gap:8px}
  .brandLogo{width:34px;height:34px;flex-basis:34px}
  .brand strong{font-size:14px;letter-spacing:-.04em}
  .brand small{display:none}
}
EOF

EXPOSE 8080
CMD ["sh", "-c", "sed -i \"s/listen       80;/listen ${PORT:-8080};/\" /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
