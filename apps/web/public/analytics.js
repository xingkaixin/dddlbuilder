window.ddlBeforeSend = (_type, payload) => {
  const url = new URL(payload.url, location.origin);
  if (/^\/(?:admin|share|publications)(?:\/|$)/.test(url.pathname)) return false;

  const campaign = new URLSearchParams();
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = url.searchParams.get(key);
    if (value) campaign.set(key, value);
  }
  url.search = campaign.toString();
  url.hash = '';

  let referrer = payload.referrer;
  if (referrer) {
    const source = new URL(referrer, location.origin);
    source.search = '';
    source.hash = '';
    referrer = source.href;
  }

  return { ...payload, url: `${url.pathname}${url.search}`, referrer };
};
