#!/bin/bash
set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
  echo "Usage: ./setup-ssl.sh yourdomain.com"
  echo ""
  echo "Prerequisites:"
  echo "  1. Domain DNS A record pointing to this server's IP"
  echo "  2. Port 80 and 443 open in the collab-ec2-sg security group"
  echo "  3. Nginx already configured and running (i.e. deploy.sh has run at least once)"
  exit 1
fi

echo "=== Setting Up SSL for $DOMAIN ==="
echo ""

echo "1. Obtaining SSL certificate from Let's Encrypt..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --redirect

echo ""
echo "   ✓ SSL certificate installed"
echo ""

echo "2. Setting up auto-renewal..."
# Certbot's Ubuntu package installs a systemd timer that runs twice daily; this just makes sure
# it's actually enabled rather than assuming the package defaults did it.
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
echo "   ✓ Auto-renewal enabled (checks twice daily)"
echo ""

echo "3. Verifying SSL..."
if curl -sf "https://$DOMAIN/api/health" > /dev/null 2>&1; then
  echo "   ✓ HTTPS is working!"
else
  echo "   ⚠ HTTPS verification failed — DNS may not have propagated yet"
  echo "   Try: curl https://$DOMAIN/api/health"
fi
echo ""

echo "=== SSL Setup Complete ==="
echo ""
echo "Your app is now live at: https://$DOMAIN"
echo "Certificate auto-renews every 60 days (Let's Encrypt certs are valid 90 days)."
echo "Dry-run a renewal any time with: sudo certbot renew --dry-run"
