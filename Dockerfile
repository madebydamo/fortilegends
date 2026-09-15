FROM python:3.12-slim

COPY theme /theme

RUN pip install --no-cache-dir mkdocs markdown-captions click==8.2.1 /theme

WORKDIR /docs

EXPOSE 8000

CMD ["mkdocs", "serve", "--dev-addr", "0.0.0.0:8000", "--verbose", "-w", "/docs/docs"]
