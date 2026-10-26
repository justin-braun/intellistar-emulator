FROM nginx:alpine
# Browsers check for a newer version on every load, see docker/nginx.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
RUN rm -r /usr/share/nginx/html/docker
