// ── Head Tags for all pages ──
(function(){

  // Favicon
  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/png';
  favicon.href = 'logo.png';
  document.head.appendChild(favicon);

  // Apple touch icon
  const apple = document.createElement('link');
  apple.rel = 'apple-touch-icon';
  apple.href = 'logo.png';
  document.head.appendChild(apple);

  // Theme color
  const theme = document.createElement('meta');
  theme.name = 'theme-color';
  theme.content = '#5a0808';
  document.head.appendChild(theme);

  // Description
  const desc = document.createElement('meta');
  desc.name = 'description';
  desc.content = 'Sri Vipassi Dhamma School - Kande Viharaya, Horana, Sri Lanka';
  document.head.appendChild(desc);

  // OG Title
  const ogTitle = document.createElement('meta');
  ogTitle.setAttribute('property', 'og:title');
  ogTitle.content = 'Sri Vipassi Dhamma School';
  document.head.appendChild(ogTitle);

  // OG Description
  const ogDesc = document.createElement('meta');
  ogDesc.setAttribute('property', 'og:description');
  ogDesc.content = 'Nurturing wisdom, compassion, and the noble Dhamma — guiding Sri Lanka toward a virtuous society.';
  document.head.appendChild(ogDesc);

  // OG Image
  const ogImg = document.createElement('meta');
  ogImg.setAttribute('property', 'og:image');
  ogImg.content = 'https://srivipassi.com/logo.png';
  document.head.appendChild(ogImg);

  // OG URL
  const ogUrl = document.createElement('meta');
  ogUrl.setAttribute('property', 'og:url');
  ogUrl.content = 'https://srivipassi.com';
  document.head.appendChild(ogUrl);

  // Manifest
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = 'site.webmanifest';
  document.head.appendChild(manifest);

})();