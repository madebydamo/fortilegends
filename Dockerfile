FROM python:3.12-slim

RUN pip install --no-cache-dir mkdocs mkdocs-simple-blog markdown-captions

WORKDIR /docs

EXPOSE 8000

CMD ["mkdocs", "serve", "--dev-addr", "0.0.0.0:8000", "--verbose"]