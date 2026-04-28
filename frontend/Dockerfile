FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Vite necesita el flag --host para que se pueda ver desde afuera del contenedor
CMD ["npm", "run", "dev", "--", "--host"]
