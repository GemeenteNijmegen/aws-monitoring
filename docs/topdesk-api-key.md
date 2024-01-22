# Topdesk API Key vervangen
De afspraak met IRVN is dat de API key van Topdesk om de 6 maanden wordt vervangen. IRVN neemt contact op.
Het IRVN hanteert meestal 3 maanden, maar omdat wij alleen gebruik maken van het wegschrijven naar Topdesk is de API koppeling minder gevoelig.

Stappen:
- Contact met IRVN (Marnix Niekus) over het vervangen van de API key.
- IRVN levert nieuwe API keys voor zowel acceptatie (dev) en productie (prod).
- Deze keys moeten ingeladen worden in de Secrets Manager in het gn-audit (302838002127) account.
- Voor productie: '/slack-integration/prod/topdesk/api/password'
- Voor accepatatie: '/slack-integration/dev/topdesk/api/password'
- Aan IRVN kant wordt L7 geupdate.
- Zodra beiden geupdate zijn (eerst testen met acceptatie) kan een test uitgevoerd worden.

