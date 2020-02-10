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
  .on('layeradd', updateSolarInfo)
  .on('move', updateSolarInfo);

map.zoomControl.setPosition('bottomleft');

map.attributionControl.setPrefix(
  '<span class="author-credit"><a href="https://twitter.com/JWasilGeo" target="_blank">@JWasilGeo</a></span> | ' +
  map.attributionControl.options.prefix
);

// top-most labels tile layer in a custom map pane
map.createPane('labels');
map.getPane('labels').style.pointerEvents = 'none';
L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_only_labels/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>',
  subdomains: ['a', 'b', 'c', 'd'],
  pane: 'labels'
}).addTo(map);

// update the terminator and nighttime layer every 10 seconds
setInterval(function() {
  terminator = updateTerminator(terminator);
  nighttimeLayer = updateNighttimeLayer(terminator, nighttimeLayer);
}, 10000);

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
  }, 5000);
  return nextNighttimeLayer;
}

function generateNighttimeLayer(terminator) {
  return L.TileLayer.boundaryCanvas('https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', {
    attribution: 'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (<a href="https://earthdata.nasa.gov">ESDIS</a>) with funding provided by NASA/HQ.',
    boundary: terminator.toGeoJSON(),
    minNativeZoom: 1,
    maxNativeZoom: 8
  });
}

function updateSolarInfo() {
  var latLngCoordinates = map.getCenter().wrap();

  var date = Date.now();

  // calculate sun times for the given date
  // we're interested in "nadir" and "solarNoon"
  var sunTimes = SunCalc.getTimes(date, latLngCoordinates.lat, latLngCoordinates.lng);

  // create a spacetime moment for the given date but at the map's center point location
  var d = spacetime(date)
    .in({
      lat: latLngCoordinates.lat,
      lon: latLngCoordinates.lng
    });

  var currentLocalTime = [
    d.time(),
    'in',
    d.timezone().name,
  ].join(' ');

  // find out if the map's center point location falls in day or night
  // by checking for the point being contained in the terminator polygon
  var isNight = turf.booleanContains(
    L.terminator().toGeoJSON(),
    turf.point([latLngCoordinates.lng, latLngCoordinates.lat])
  );

  // update the html display text
  if (isNight) {
    solarInfoNode.innerHTML = [
      '<h1>Night and Day</h1><div>',
      currentLocalTime,
      '</div><div>Night is darkest at ',
      spacetime(sunTimes.nadir).goto(d.timezone().name).time(),
      '</div>'
    ].join('');
  } else {
    solarInfoNode.innerHTML = [
      '<h1>Day and Night</h1><div>',
      currentLocalTime,
      '</div><div>Sun is highest at ',
      spacetime(sunTimes.solarNoon).goto(d.timezone().name).time(),
      '</div>'
    ].join('');
  }
}
