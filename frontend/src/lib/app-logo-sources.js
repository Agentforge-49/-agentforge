const SIMPLE_ICON_SLUGS = {
  google_sheets:'googlesheets', google_drive:'googledrive', microsoft_teams:'microsoftteams',
  microsoft_outlook:'microsoftoutlook', google_calendar:'googlecalendar', whatsapp_business:'whatsapp',
  monday:'mondaydotcom', customer_io:'customerio', facebook_pages:'facebook',
  instagram_business:'instagram', quickbooks:'intuit', google_cloud:'googlecloud',
  bigquery:'googlebigquery', aws:'amazonwebservices', azure:'microsoftazure', docker_hub:'docker',
  google_gemini:'googlegemini', adobe_sign:'adobeacrobatreader', apollo_io:'apollo',
  zoho_crm:'zoho', dynamics_365:'microsoftdynamics365', telegram:'telegram',
}

const LEGACY_SIMPLE_ICONS = 'https://cdn.jsdelivr.net/npm/simple-icons@12.4.0/icons'
const RECENT_SIMPLE_ICONS = 'https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons'
const brandFavicon = domain => `https://www.google.com/s2/favicons?domain_url=https://${domain}&sz=128`
const ICON_URL_OVERRIDES = {
  activecampaign:brandFavicon('activecampaign.com'),
  adobe_sign:`${LEGACY_SIMPLE_ICONS}/adobeacrobatreader.svg`,
  apollo_io:brandFavicon('apollo.io'),
  aws:`${LEGACY_SIMPLE_ICONS}/amazonwebservices.svg`,
  azure:`${LEGACY_SIMPLE_ICONS}/microsoftazure.svg`,
  canva:`${LEGACY_SIMPLE_ICONS}/canva.svg`,
  chargebee:brandFavicon('chargebee.com'),
  customer_io:brandFavicon('customer.io'),
  docusign:`${LEGACY_SIMPLE_ICONS}/docusign.svg`,
  dynamics_365:`${LEGACY_SIMPLE_ICONS}/dynamics365.svg`,
  freshdesk:brandFavicon('freshdesk.com'),
  gong:brandFavicon('gong.io'),
  jotform:brandFavicon('jotform.com'),
  klaviyo:brandFavicon('klaviyo.com'),
  linkedin:`${LEGACY_SIMPLE_ICONS}/linkedin.svg`,
  monday:'https://cdn.monday.com/images/logos/monday_logo_icon.png',
  microsoft_outlook:`${LEGACY_SIMPLE_ICONS}/microsoftoutlook.svg`,
  microsoft_teams:`${LEGACY_SIMPLE_ICONS}/microsoftteams.svg`,
  onedrive:`${LEGACY_SIMPLE_ICONS}/microsoftonedrive.svg`,
  openai:`${LEGACY_SIMPLE_ICONS}/openai.svg`,
  pinecone:brandFavicon('pinecone.io'),
  pipedrive:brandFavicon('pipedrive.com'),
  plaid:brandFavicon('plaid.com'),
  salesforce:`${LEGACY_SIMPLE_ICONS}/salesforce.svg`,
  segment:brandFavicon('segment.com'),
  sendgrid:`${RECENT_SIMPLE_ICONS}/sendgrid.svg`,
  servicenow:brandFavicon('servicenow.com'),
  twilio:`${LEGACY_SIMPLE_ICONS}/twilio.svg`,
  weaviate:brandFavicon('weaviate.io'),
}

export function appLogoUrl(slug) {
  return ICON_URL_OVERRIDES[slug] || `https://cdn.simpleicons.org/${SIMPLE_ICON_SLUGS[slug] || slug.replaceAll('_', '')}`
}
