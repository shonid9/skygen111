FROM nginx:alpine
COPY . /usr/share/nginx/html/
EXPOSE 8080
CMD ["sh", "-c", "sed -i \"s/listen       80;/listen ${PORT:-8080};/\" /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
