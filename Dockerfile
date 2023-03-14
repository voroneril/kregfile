FROM node:14
ENV KREG=/kregfile
WORKDIR ${KREG}
ADD . $KREG
#Change the default redis host to docker container name. Avoids needing a .config.json .
RUN sed -i '/^\ \ \/\/\ redis_.*/a \ \ redis_host:\ \"redis-kreg\",' /kregfile/defaults.js

RUN yarn
ENTRYPOINT ["yarn"]
CMD ["start"]
