var solarInfoNode = document.getElementById('solarInfo');

var daylightLayer = L.esri.basemapLayer('Imagery');

var terminator = L.terminator();

var nighttimeLayer = generateNighttimeLayer(terminator);

var map = L.map('map', {
  center: [0, 180],
  zoom: 2,
  minZoom: 1,
  maxZoom: 10,
  worldCopyJump: true,
  maxBounds: [
    [89, -Infinity],
    [-89, Infinity]
  ],
  layers: [
    daylightLayer,
    nighttimeLayer
  ]
})
  .once('layeradd', updateSolarInfo)
  .on('move', updateSolarInfo);

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
  // sorta funky but visually effective way to remove the previous nighttime layer
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
  var latLngCoordinates = evt.target.getCenter();
  var sunTimes = SunCalc.getTimes(Date.now(), latLngCoordinates.lat, latLngCoordinates.lng);
  var isNight = turf.booleanContains(L.terminator().toGeoJSON(), turf.point([latLngCoordinates.lng, latLngCoordinates.lat]));

  if (isNight) {
    solarInfoNode.innerHTML = [
      '<div>night is darkest at: ',
      sunTimes.nadir.toLocaleTimeString(),
      '</div>'
    ].join('');
  } else {
    solarInfoNode.innerHTML = [
      '<div>day is brightest at: ',
      sunTimes.solarNoon.toLocaleTimeString(),
      '</div>'
    ].join('');
  }
}

/* 
map.on('mousemove', function(evt) {
  // var latLngCoordinates = evt.target.getCenter();
  var latLngCoordinates = evt.latlng;

  var sunPosition = SunCalc.getPosition(Date.now(), latLngCoordinates.lat, latLngCoordinates.lng);
  var sunAltitudeDegrees = sunPosition.altitude * (180 / Math.PI);

  var cutoff = 30;
  var nighttimeLayerOpacity = 1;

  if (sunAltitudeDegrees > 0) {
    if (sunAltitudeDegrees <= cutoff) {
      nighttimeLayerOpacity = 1 - (sunAltitudeDegrees / cutoff);
    } else {
      nighttimeLayerOpacity = 0;
    }
  }

  nighttimeLayer.setOpacity(nighttimeLayerOpacity);
  daylightLayer.setOpacity(1 - nighttimeLayerOpacity);
});
 */
