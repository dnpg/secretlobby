# ==============================================================================
# Shared Location Configuration
# Included by all server blocks
# ==============================================================================

# Client body size (for file uploads)
client_max_body_size 100M;

# Health check endpoint
location /health {
    access_log off;
    return 200 "OK\n";
    add_header Content-Type text/plain;
}

# Nginx status (internal only)
location /nginx-status {
    stub_status;
    allow 127.0.0.1;
    allow 172.16.0.0/12;  # Docker networks
    deny all;
}

# Block access to hidden files
location ~ /\. {
    deny all;
    access_log off;
    log_not_found off;
}

# Static assets with caching
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Subdomain $subdomain;
    proxy_set_header X-Original-Host $host;

    # Caching
    expires 30d;
    add_header Cache-Control "public, immutable";
}

# API endpoints
location /api/ {
    limit_req zone=api burst=50 nodelay;

    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    # Headers for the app to identify tenant
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Subdomain $subdomain;
    proxy_set_header X-Original-Host $host;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}

# WebSocket support (for live features)
location /ws {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Subdomain $subdomain;

    proxy_read_timeout 86400;
}

# Main application
location / {
    limit_req zone=general burst=20 nodelay;

    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    # Headers for the app to identify tenant
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Subdomain $subdomain;
    proxy_set_header X-Original-Host $host;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Buffering
    proxy_buffering on;
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
}
