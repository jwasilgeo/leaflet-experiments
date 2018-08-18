var solarInfoNode = document.querySelector('#solarInfo');

var daylightLayer = L.esri.basemapLayer('Imagery');

spacetime.extend(spacetimeGeo);

var terminator = L.terminator();

var nighttimeLayer = generateNighttimeLayer(terminator);

var map = L.map('map', {
  center: [27.5, 90.5],
  zoom: 2,
  minZoom: 1,
  maxZoom: 10,
  worldCopyJump: true,
  layers: [
    daylightLayer,
    nighttimeLayer
  ]
})
  .once('layeradd', updateSolarInfo)
  .on('move', updateSolarInfo);
  
map.attributionControl.setPrefix(
  map.attributionControl.options.prefix +
  ' | Website by <a class="author-credit" href="https://twitter.com/JWasilGeo" target="_blank">@JWasilGeo</a>'
);

// top-most labels tile layer in a custom map pane
map.createPane('labels');
map.getPane('labels').style.pointerEvents = 'none';
L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_only_labels/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>',
  subdomains: ['a', 'b', 'c', 'd'],
  pane: 'labels'
}).addTo(map);

// update the terminator and nighttime layer every 5 seconds
setInterval(function() {
  terminator = updateTerminator(terminator);
  nighttimeLayer = updateNighttimeLayer(terminator, nighttimeLayer);
}, 5000);

function updateTerminator(terminator) {
  var newTerminator = L.terminator();
  terminator.setLatLngs(newTerminator.getLatLngs());
  terminator.redraw();
  return terminator;
}

function updateNighttimeLayer(terminator, previousNighttimeLayer) {
  var nextNighttimeLayer = generateNighttimeLayer(terminator).addTo(map);
  // sorta funky, but visually effective way to remove the previous nighttime layer
  setTimeout(function() {
    previousNighttimeLayer.remove();
  }, 1000);
  return nextNighttimeLayer;
}

function generateNighttimeLayer(terminator) {
  return L.TileLayer.boundaryCanvas('https://gibs.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default//GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg', {
    attribution: 'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (<a href="https://earthdata.nasa.gov">ESDIS</a>) with funding provided by NASA/HQ.',
    boundary: terminator.toGeoJSON(),
    minNativeZoom: 1,
    maxNativeZoom: 8
  });
}

function updateSolarInfo(evt) {
  var latLngCoordinates = map.wrapLatLng(evt.target.getCenter());

  var sunTimes = SunCalc.getTimes(Date.now(), latLngCoordinates.lat, latLngCoordinates.lng);

  var d = spacetime.now();
  d.in({
    lat: latLngCoordinates.lat,
    lon: latLngCoordinates.lng
  });

  var currentLocalTime = [
    'Currently:',
    d.time(),
    'in',
    d.timezone().name,
  ].join(' ');

  var isNight = turf.booleanContains(
    L.terminator().toGeoJSON(),
    turf.point([latLngCoordinates.lng, latLngCoordinates.lat])
  );

  if (isNight) {
    solarInfoNode.innerHTML = [
      '<div>',
      currentLocalTime,
      '</div><div>Night is darkest at: ',
      spacetime(sunTimes.nadir).goto(d.timezone().name).time(),
      '</div>'
    ].join('');
  } else {
    solarInfoNode.innerHTML = [
      '<div>',
      currentLocalTime,
      '</div><div>Sun is highest at: ',
      spacetime(sunTimes.solarNoon).goto(d.timezone().name).time(),
      '</div>'
    ].join('');
  }
}
