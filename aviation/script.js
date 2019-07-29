var aircraftNode = document.querySelector('#aircraft'),
  aircraftSummaryNode = document.querySelector('#aircraftSummary'),
  aggregateSummaryStatsHTML,
  localSummaryStatsHTML,
  radarNode = document.querySelector('.radar'),
  currentAjax = null,
  currentAircraftMarkers = {
    parallax: [],
    shadow: []
  };

var terminator = L.terminator({
  stroke: false,
  fillOpacity: 0.4,
  interactive: false
});

// aircraft marker group layers
var aircraftParallaxGroupLayer = L.featureGroup()
  .on('click mouseover', function(e) {
    // TODO: need to track witch parallaxMarker was interacted with b/c currently it gets reset after a map move

    aircraftParallaxGroupLayer.eachLayer(function(layer) {
      if (map.hasLayer(layer)) {
        layer.getElement().style.color = '';
      }
    });

    e.layer.getElement().style.color = 'deepskyblue';

    aircraftNode.innerHTML = [
      '<p>',
      e.layer._aircraft[1] + ' ' + e.layer._aircraft[2],
      '</p><p>',
      e.layer._aircraft[13] || '---',
      ' ft</p><hr>'
    ].join('');
  });

var aircraftShadowGroupLayer = L.featureGroup();

var worldwideAircraftGroupLayer = L.featureGroup();

var oldZoom = null;

var map = L.map('map', {
  center: [0, 0],
  zoom: 2,
  minZoom: 1,
  maxBounds: [
    [89, -250],
    [-89, 250]
  ],
  worldCopyJump: true,
  layers: [
    L.esri.basemapLayer('Gray'),
    L.esri.basemapLayer('GrayLabels'),
    terminator,
    worldwideAircraftGroupLayer
  ],
  preferCanvas: true
})
  .on('zoomstart', function() {
    oldZoom = map.getZoom();
  })
  .on('zoom', function() {
    var newZoom = map.getZoom();
    toggleWorldwideLayer(oldZoom, newZoom);
    updateParallaxZOffset(oldZoom, newZoom);
  })
  .on('moveend', function() {
    wrapMarkers(worldwideAircraftGroupLayer);
    filterParallaxAircraftAtCurrentMapBounds();
  });

// map.attributionControl.addAttribution('Aircraft data provided by <span style="font-weight: bold;">The OpenSky Network</span> <a href="https://www.opensky-network.org/" target="_blank">https://www.opensky-network.org</a>');

map.attributionControl.setPrefix(
  '<span class="author-credit"><a href="https://twitter.com/JWasilGeo" target="_blank">@JWasilGeo</a></span> | ' +
  'Aircraft data provided by <span style="font-weight: bold;">The OpenSky Network</span> <a href="https://www.opensky-network.org" target="_blank">https://www.opensky-network.org</a> | ' +
  map.attributionControl.options.prefix
);

L.esri.Geocoding.geosearch({
  placeholder: 'SEARCH FOR AN AIRPORT',
  title: 'Airport Location Search',
  position: 'topright',
  expanded: true,
  collapseAfterResult: false,
  useMapBounds: false,
  zoomToResult: false,
  providers: [
    L.esri.Geocoding.arcgisOnlineProvider({
      categories: 'Airport'
    })
  ]
})
  .on('results', function(data) {
    if (data.results.length) {
      map.fitBounds(data.results[0].bounds.pad(5));
    }
  })
  .addTo(map);

// initially display aircraft reporting their location around the world
generateAircraftWorldwide();

function toggleWorldwideLayer(oldZoom, newZoom) {
  var thresholdZoom = 7;
  if (oldZoom < newZoom && newZoom >= thresholdZoom) {
    // zooming in and past a threshold
    //  - hide worldwide layer
    //  - show aircraft related layers
    if (map.hasLayer(worldwideAircraftGroupLayer)) {
      worldwideAircraftGroupLayer.remove();
    }

    if (!map.hasLayer(aircraftParallaxGroupLayer)) {
      aircraftParallaxGroupLayer.addTo(map);
      aircraftShadowGroupLayer.addTo(map);
    }

    aircraftSummaryNode.innerHTML = localSummaryStatsHTML || aggregateSummaryStatsHTML;
  } else if (oldZoom > newZoom && newZoom <= thresholdZoom) {
    // zooming out and past a threshold
    //  - show worldwide layer
    //  - hide aircraft related layers
    if (!map.hasLayer(worldwideAircraftGroupLayer)) {
      worldwideAircraftGroupLayer.addTo(map);
    }

    if (map.hasLayer(aircraftParallaxGroupLayer)) {
      aircraftParallaxGroupLayer.remove();
      aircraftShadowGroupLayer.remove();
      L.DomUtil.empty(aircraftNode);
    }

    aircraftSummaryNode.innerHTML = aggregateSummaryStatsHTML;
  }
}

function updateParallaxZOffset(oldZoom, newZoom) {
  // TODO: keep doing this?

  var thresholdZoom = 10;
  if (oldZoom < newZoom && newZoom >= thresholdZoom) {
    // zooming in and past a threshold:
    //  - when the map's current zoom level is going to be greater than or equal to 10
    //    use a smaller parallaxZoffset (aircraft altitude divided by 90)
    aircraftParallaxGroupLayer.eachLayer(function(layer) {
      layer.options.parallaxZoffset = layer._aircraft[13] / 90;
    });
  } else if (oldZoom > newZoom && newZoom <= thresholdZoom) {
    // zooming out and past a threshold:
    //  - when the map's current zoom level is going to be less than 10
    //    revert to the original parallaxZoffset (aircraft altitude divided by 10)
    aircraftParallaxGroupLayer.eachLayer(function(layer) {
      layer.options.parallaxZoffset = layer._aircraft[13] / 10;
    });
  }
}

function generateAircraftWorldwide() {
  radarNode.classList.remove('off');

  // remove all the previous aircraft from the map
  worldwideAircraftGroupLayer.clearLayers();
  aircraftParallaxGroupLayer.clearLayers();
  aircraftShadowGroupLayer.clearLayers();

  if (currentAjax) {
    currentAjax.abort('stopped early');
    currentAjax = null;
  }

  currentAjax = $.ajax({
    url: 'https://opensky-network.org/api/states/all',
    dataType: 'json'
  })
    .done(function(response) {
      if (currentAjax) {
        currentAjax = null;
      }

      // TODO: repeat with an interval?
      // setTimeout(generateAircraftWorldwide, 10000);

      radarNode.classList.add('off');

      updateTerminator(terminator);

      if (!response.states) {
        return;
      }

      var aircraftList = response.states
        .filter(function(aircraft) {
          // ignore aircraft that are reporting themselves to be on the ground [8]
          // or are missing important attributes such as an altitude [13], longitude [5], and latitude [6]
          if (
            !aircraft[8] &&
            aircraft[13] &&
            (aircraft[5] && aircraft[6])
          ) {
            // convert meters to feet
            aircraft[13] = Math.round(aircraft[13] * 3.28084);

            return aircraft;
          }
        })
        .sort(function(aircraftA, aircraftB) {
          // sort ascending by altitude
          return aircraftA[13] - aircraftB[13];
        });

      aggregateSummaryStatsHTML = [
        '<p><span style="color: deepskyblue; font-size: 1.3em; font-weight: bold;">',
        aircraftList.length,
        '</span> AIRCRAFT AROUND THE WORLD CURRENTLY REPORTING THEIR POSITION</p>',
        '<p style="font-style: italic; color: deepskyblue;">ZOOM IN OR SEARCH FOR AN AIRPORT</p>'
      ].join('');

      aircraftSummaryNode.innerHTML = aggregateSummaryStatsHTML;

      aircraftList.forEach(function(aircraft) {
        // var simpleCircleMarker = L.circleMarker([aircraft.Lat, aircraft.Long], {
        var simpleCircleMarker = L.circleMarker([aircraft[6], aircraft[5]], {
          radius: 2, // pixels,
          interactive: false,
          stroke: false,
          fillOpacity: 0.3,
          fillColor: 'deepskyblue'
        });

        // use Font Awesome's "fa-plane" icon
        // https://fontawesome.com/icons/plane?style=solid

        // when zoomed in, show the aircraft in the sky using the parallax plugin
        var parallaxMarker = L.Marker.parallax(
          {
            lat: aircraft[6],
            lng: aircraft[5]
          }, {
            parallaxZoffset: aircraft[13] / 10, // use the altitude for the parallax z-offset value
            // TODO: figure out a good scale transform
            icon: L.divIcon({
              className: 'leaflet-marker-icon leaflet-zoom-animated leaflet-interactive',
              html: '<i class="fas fa-plane fa-2x" style="transform:rotate(calc(-45deg + ' + aircraft[10] + 'deg)) scale(' + Math.max(1, aircraft[13] / 10500) + ');" aria-hidden="true"></i>'
            })
          }
        );

        // hold onto the aircraft info for later usage
        parallaxMarker._aircraft = aircraft;

        // also when zoomed in, show the "shadow" of the aircraft at its reported coordinates on the ground
        var shadowMarker = L.marker(
          {
            lat: aircraft[6],
            lng: aircraft[5]
          }, {
            icon: L.divIcon({
              className: 'leaflet-marker-icon leaflet-zoom-animated',
              html: '<i class="fas fa-plane fa-2x shadow" style="transform:rotate(calc(-45deg + ' + aircraft[10] + 'deg));" aria-hidden="true"></i>'
            }),
            interactive: false,
            pane: 'shadowPane'
          }
        );

        worldwideAircraftGroupLayer.addLayer(simpleCircleMarker);

        currentAircraftMarkers.parallax.push(parallaxMarker);
        currentAircraftMarkers.shadow.push(shadowMarker);
      });

      filterParallaxAircraftAtCurrentMapBounds();
    })
    .fail(function(error) {
      if (currentAjax) {
        currentAjax = null;
      }

      // TODO: repeat with an interval?
      // setTimeout(generateAircraftWorldwide, 10000);

      if (error.statusText === 'stopped early') {
        return;
      }

      radarNode.classList.add('off');
      console.error(error);
    });
}

function filterParallaxAircraftAtCurrentMapBounds() {
  if (map.hasLayer(worldwideAircraftGroupLayer)) {
    return;
  }

  aircraftParallaxGroupLayer.clearLayers();
  aircraftShadowGroupLayer.clearLayers();

  var mapBounds = map.getBounds();

  currentAircraftMarkers.parallax.forEach(function(parallaxMarker, index) {
    if (mapBounds.contains(parallaxMarker.getLatLng())) {
      aircraftParallaxGroupLayer.addLayer(parallaxMarker);
      aircraftShadowGroupLayer.addLayer(currentAircraftMarkers.shadow[index]);
    }
  });

  // TODO: text for "local stats"
  var aircraftCount = aircraftParallaxGroupLayer.getLayers().length;

  var highestAltitude = aircraftParallaxGroupLayer.getLayers()
    .map(function(layer) {
      return layer._aircraft[13];
    })
    .reduce(function(previousValue, currentValue) {
      return Math.max(previousValue, currentValue);
    }, 0);

  localSummaryStatsHTML = [
    '<p>AIRCRAFT: ',
    aircraftCount,
    '</p><p>HIGHEST: ',
    highestAltitude,
    ' ft</p>'
  ].join('');

  aircraftSummaryNode.innerHTML = localSummaryStatsHTML;
}

function updateTerminator(terminator) {
  var newTerminator = L.terminator();
  terminator.setLatLngs(newTerminator.getLatLngs());
  terminator.redraw();
  return terminator;
}

function wrapMarkers(groupLayer) {
  // ensure that the point features will be drawn beyond +/-180 longitude
  groupLayer.eachLayer(function(layer) {
    var wrappedLatLng = wrapAroundLatLng(layer.getLatLng());
    layer.setLatLng(wrappedLatLng);
  });
}

function wrapAroundLatLng(latLng) {
  var wrappedLatLng = latLng.clone();
  var mapCenterLng = map.getCenter().lng;
  var wrapAroundDiff = mapCenterLng - wrappedLatLng.lng;
  if (wrapAroundDiff < -180 || wrapAroundDiff > 180) {
    wrappedLatLng.lng += (Math.round(wrapAroundDiff / 360) * 360);
  }
  return wrappedLatLng;
}
