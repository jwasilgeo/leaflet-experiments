// INSPIRED HEAVILY BY https://github.com/jgravois/lerc-leaflet

// create a custom layer type extending from the LeafletJS GridLayer
const Lerc8bitColorLayer = L.GridLayer.extend({
  createTile: function (coords, done) {
    let tileError;
    let tile = L.DomUtil.create('canvas', 'leaflet-tile');
    tile.width = this.options.tileSize;
    tile.height = this.options.tileSize;

    const tileUrl = this.options.url + '/tile/' + coords.z + '/' + coords.y + '/' + coords.x;

    fetch(tileUrl, {
      "method": "GET",
    })
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => {
        try {
          // decode the response's arrayBuffer (Lerc global comes from an imported script)
          tile.decodedPixels = Lerc.decode(arrayBuffer);

          // display newly decoded pixel data as canvas context image data
          this.draw.call(this, tile);
        } catch (error) {
          console.error(error);
          // displaying error text in the canvas tile is for debugging/demo purposes
          // we could instead call `this.draw.call(this, tile);` to bring less visual attention to any errors
          this.drawError(tile);
        }
        done(tileError, tile);
      })
      .catch(error => {
        console.error(error);
        // displaying error text in the canvas tile is for debugging/demo purposes
        // we could instead call `this.draw.call(this, tile);` to bring less visual attention to any errors
        this.drawError(tile);
        done(tileError, tile);
      });

    return tile;
  },

  draw: function (tile) {
    const width = tile.decodedPixels.width;
    const height = tile.decodedPixels.height;
    const pixels = tile.decodedPixels.pixels[0]; // get pixels from the first band (only 1 band when 8bit RGB)
    const mask = tile.decodedPixels.maskData;
    const rasterAttributeTableFeatures = this.options.rasterAttributeTable.features;

    // write new canvas context image data by working with the decoded pixel array and mask array
    const ctx = tile.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < width * height; i++) {
      // look up RGB colormap attributes in the raster attribute table for the decoded pixel value
      const pixelValue = pixels[i];
      const attributes = rasterAttributeTableFeatures.find(info => info.attributes.Value === pixelValue).attributes;
      data[i * 4] = attributes.Red;
      data[i * 4 + 1] = attributes.Green;
      data[i * 4 + 2] = attributes.Blue;

      // make the pixel transparent when either missing data exists for the decoded mask value
      // or for this particular ImageServer when the ClassName raster attribute is "No Data"
      if ((mask && !mask[i]) || attributes.ClassName === "No Data") {
        data[i * 4 + 3] = 0;
      } else {
        data[i * 4 + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  },

  drawError: function (tile) {
    const width = tile.width;
    const height = tile.height;
    const ctx = tile.getContext('2d');
    ctx.font = 'italic 12px sans-serif';
    ctx.fillStyle = 'darkred';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'Error decoding data or tile may not exist here.',
      width / 2,
      height / 2,
      width - 10
    );
  }
});

// create a LeafletJS map in WKID 4326
const map = L.map("map", {
  crs: L.CRS.EPSG4326
}).setView([35, 73], 3);

map.attributionControl.setPrefix(
  '<span class="author-credit"><a href="https://twitter.com/JWasilGeo" target="_blank">@JWasilGeo</a></span> | ' +
  '<a href="https://www.arcgis.com/home/item.html?id=d6642f8a4f6d4685a24ae2dc0c73d4ac" target="_blank">2020 global land cover map (produced by Impact Observatory for Esri)</a> | ' +
  'Learn more at <a href="https://github.com/jwasilgeo/leaflet-experiments" target="_blank">https://github.com/jwasilgeo/leaflet-experiments</a> | ' +
  map.attributionControl.options.prefix
);

// before creating an instance of the layer and adding it to the map, first get the raster attribute table
// from the ImageServer because we need to assign RGB colors to land cover pixel categories
fetch("https://tiledimageservices.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Esri_2020_Land_Cover_V2/ImageServer/rasterattributetable?f=json", {
  method: 'GET'
})
  .then(response => response.json())
  .then(rasterAttributeTable => {
    // create an instance of the custom "Lerc8bitColorLayer" defined above
    const landcoverLayer = new Lerc8bitColorLayer({
      url: 'https://tiledimageservices.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Esri_2020_Land_Cover_V2/ImageServer',
      rasterAttributeTable: rasterAttributeTable,
      tileSize: 256
    });

    // and finally add it to the map
    landcoverLayer.addTo(map);
  })
  .catch(error => {
    console.error('Error loading ImageServer raster attribute table', error);
  });