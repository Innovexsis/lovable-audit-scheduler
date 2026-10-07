# MASTER PATCH v76 — Public Product Pages and Installable Identity

This policy covers every verified public portal. A portal's management status
does not remove it from identity monitoring. Independent or monitor-only portals
receive a finding and local adoption instructions; the master MUST NOT write to
their repositories or overwrite their approved identity.

## Required public product experience

Every public product or service must have a direct, crawlable page that explains
its purpose, features, advantages, accurate pricing or contact-sales state,
current promotion, and a purchase/contact action. The parent portal must link to
this page so a customer can buy one product without browsing the whole suite.

Each product must also expose its own installable PWA identity: unique app name,
short name, description, stable id, start page, theme, favicon, Apple icon and
192/512 icons. Shared authentication, database, billing and connectors remain
shared; product identity does not duplicate the service layer.

## Search and AI identity

Publish unique title, description, canonical, og:url, structured Product or
SoftwareApplication data, robots rules and sitemap entries for every product.
Describe the parent relationship as “part of Innovexsis” without collapsing the
product's own name or canonical identity.

## Safety and verification

Preserve all approved names, logos and domains. Unknown prices must say contact
sales. Verify the public page, manifest, icons, metadata, robots and sitemap after
deployment. Retry transient checks at most three times and report inaccessible,
unpublished or independent portals as pending owner-project adoption.

<!-- applied-by: MARTECH master | version: v76 | reason: slave-patch-selfheal:fleet | at: 2026-10-06T02:25:03.559Z -->
