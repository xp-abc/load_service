package services

import akka.actor._
import java.net.ConnectException
import scala.concurrent.duration._
import play.api.libs.concurrent.Execution.Implicits.defaultContext
import akka.util.Timeout

import model.LoadSpec

import LoadActor._
import akka.actor.Cancellable
import play.api.libs.ws._
import akka.actor.OneForOneStrategy
import akka.actor.SupervisorStrategy._
import scala.concurrent.duration._

object LoadSessionActor {
  def props(name: String, loadSpec: LoadSpec, ws: WSClient) = Props[LoadSessionActor](new LoadSessionActor(name, loadSpec, ws))

  case class StartSession()
  case class EndSession()
  case class RampUp();
}

class LoadSessionActor(val name: String, val loadSpec: LoadSpec, val ws: WSClient) extends Actor {
  import LoadSessionActor._


 
  override val supervisorStrategy =
    OneForOneStrategy(maxNrOfRetries = 10, withinTimeRange = 1 minute) {
      case _: LoadConnectException => 
        Escalate
      case _:NullPointerException =>
        Escalate
      case t =>
        println("LoadSessionActor supervisor: " + t);
        super.supervisorStrategy.decider.applyOrElse(t, (_: Any) => Escalate)
    }
  
  
  val loadActor = context.actorOf(LoadActor.props(ws, loadSpec), "load-actor-" + name)
  var cancellables: List[Cancellable] = Nil
  var rampUpSecond:Int = 0;
  val numberOfSlots = loadSpec.numberOfSendingSlots.getOrElse(1)
  val rampupTimeInSeconds = loadSpec.rampUpTimeInSeconds.getOrElse(1)
  val fromNumberOfRequestPerSecond = loadSpec.fromNumberOfRequestPerSecond.getOrElse(1)

  def numberOfRequestPerSlot(nrOfSlots: Int, nrOfRequestPerSecond: Int): List[(Int, Int)] = {
    val rests = List.fill(nrOfRequestPerSecond % nrOfSlots)(1)
    val wholes = List.fill(nrOfSlots)(nrOfRequestPerSecond / nrOfSlots)
    wholes.zipAll(rests, 0, 0).map(x => x._1 + x._2).zipWithIndex
  }

  def receive = {
    case StartSession =>
      println("LoadSessionActor: Start Session: " + loadSpec)  
      context.system.scheduler.scheduleOnce(1000.millis, self, RampUp)
    case EndSession =>
      println("LoadSessionActor: Stop Session")
      cancellables.foreach { x => x.cancel }
      context.stop(loadActor)
      context.stop(self)
    case RampUp =>
      if(rampUpSecond < rampupTimeInSeconds) {
        rampUpSecond = rampUpSecond + 1    
        context.system.scheduler.scheduleOnce(1000.millis, self, RampUp)
        val rampUpNumberOfRequests = (loadSpec.numberOfRequestPerSecond*rampUpSecond)/rampupTimeInSeconds
        cancellables = numberOfRequestPerSlot(numberOfSlots, rampUpNumberOfRequests).map(numberOfRequests => {
          val slotIndex = numberOfRequests._2
          context.system.scheduler.scheduleOnce((slotIndex * (1000/numberOfSlots)).millis, loadActor, SendRequest(numberOfRequests._1))
        })  
        
      } else {
        cancellables = numberOfRequestPerSlot(numberOfSlots, loadSpec.numberOfRequestPerSecond).map(numberOfRequests => {
          val slotIndex = numberOfRequests._2
          context.system.scheduler.schedule((slotIndex * (1000/numberOfSlots)).millis, 1000.millis, loadActor, SendRequest(numberOfRequests._1))
        })        
      }
  }

}