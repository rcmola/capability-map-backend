FROM registry.access.redhat.com/ubi8/nodejs-20:latest
WORKDIR /opt/app-root/src
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
