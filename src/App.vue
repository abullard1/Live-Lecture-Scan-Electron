<template>
  <div class="app">
    <div class="columns">
      <div class="column">
        <div class="sub-columns">
          <div class="sub-column camera-feed">
            <video ref="webcam" autoplay></video>
          </div>
          <div class="separator horizontal"></div>
          <div class="sub-column camera-settings">3</div>
        </div>
      </div>
      <div class="separator vertical"></div>
      <div class="column">
        <div class="scrollable-text" id="scrollable-text">
          <p v-for="i in 100" :key="i">This is a long text {{ i }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'App',
  mounted() {
    this.startWebcam();
  },
  methods: {
    async startWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.$refs.webcam.srcObject = stream;
      } catch (error) {
        console.error('Error accessing webcam:', error);
      }
    }
  }
};
</script>

<style>
body {
  margin: 0;
  font-family: 'Roboto', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #f5f5f5;
}

.app {
  display: flex;
  height: 100vh;
  background-color: #f5f5f5;
  width: 100vw;
  padding: 1em;
  box-sizing: border-box;
}

.columns {
  display: flex;
  flex: 1;
  column-gap: 1em;
  padding: 1em;
}

.column {
  flex: 1;
}

.sub-columns {
  display: flex;
  flex-direction: column;
  row-gap: 1em;
  height: 100%;
}

.sub-column {
  flex: 1 1 50%;
  background-color: #ffffff;
  border: none;
  padding: 1em;
  box-sizing: border-box;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-radius: 15px;
}

.separator {
  background-color: #dcdcdc;
  align-self: stretch;
}

.separator.horizontal {
  height: 0.05em;
  margin-left: 3.5em;
  margin-right: 3.5em;
}

.separator.vertical {
  margin-top: 3.5em;
  margin-bottom: 3.5em;
  width: 0.05em;
}

.camera-feed video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 15px;
}

.scrollable-text {
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 1em;
  background-color: #ffffff;
  border: none;
  border-radius: 15px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.scrollable-text p {
  margin: 0;
  padding: 0.5em;
  border-bottom: 1px solid #eee;
  border-radius: 5px;
}

.scrollable-text::-webkit-scrollbar {
  width: 8px;
}

.scrollable-text::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.scrollable-text::-webkit-scrollbar-track {
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}
</style>